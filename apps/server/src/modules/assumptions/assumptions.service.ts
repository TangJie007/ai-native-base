import { Injectable } from '@nestjs/common'
import { ErrorCode, type Assumption, type AssumptionsGate, type UpdateAssumptionDto } from '@specforge/shared'
import { notFound } from '../../common/app-exception'
import { toAssumption, type Row } from '../../common/mappers'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class AssumptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(projectId: string): Promise<Assumption[]> {
    const rows = await this.prisma.assumption.findMany({
      where: { projectId },
      orderBy: { code: 'asc' },
    })
    return rows.map((row) => toAssumption(row as unknown as Row))
  }

  /** 卡点一：全部假设已确认或沿用默认才放行（PRD 3.1 AST-07 / 6.1） */
  async gate(projectId: string): Promise<AssumptionsGate> {
    const [total, resolved] = await Promise.all([
      this.prisma.assumption.count({ where: { projectId } }),
      this.prisma.assumption.count({ where: { projectId, status: { in: ['confirmed', 'default'] } } }),
    ])
    const pending = total - resolved
    const allowed = total > 0 && pending === 0
    return {
      allowed,
      total,
      resolved,
      pending,
      blockedReason: allowed
        ? null
        : total === 0
          ? '尚未导入需求文档，没有可确认的假设。'
          : `还有 ${pending} 条假设待确认。`,
    }
  }

  async update(assumptionId: string, dto: UpdateAssumptionDto): Promise<Assumption> {
    const current = await this.prisma.assumption.findUnique({ where: { id: assumptionId } })
    if (!current) throw notFound(ErrorCode.NOT_FOUND, { assumptionId })

    const hasAnswer = dto.userAnswer !== undefined && dto.userAnswer !== null && dto.userAnswer !== ''
    const status = dto.status ?? (hasAnswer ? 'confirmed' : undefined)

    const row = await this.prisma.assumption.update({
      where: { id: assumptionId },
      data: {
        status: status ?? undefined,
        userAnswer: dto.userAnswer === undefined ? undefined : dto.userAnswer,
      },
    })
    return toAssumption(row as unknown as Row)
  }

  /** 一键沿用 AI 默认值，全部置为 default */
  async confirmAll(projectId: string): Promise<Assumption[]> {
    await this.prisma.assumption.updateMany({
      where: { projectId, status: 'pending' },
      data: { status: 'default' },
    })
    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'awaiting_contract', currentStage: 'S2' },
    })
    return this.list(projectId)
  }

  async projectIdOf(assumptionId: string): Promise<string> {
    const row = await this.prisma.assumption.findUnique({ where: { id: assumptionId } })
    if (!row) throw notFound(ErrorCode.NOT_FOUND, { assumptionId })
    return row.projectId
  }
}
