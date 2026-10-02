import { Injectable } from '@nestjs/common'
import { ErrorCode, type AgentTrace, type TracesPayload, type TraceSummary } from '@specforge/shared'
import { notFound } from '../../common/app-exception'
import { toAgentTrace, type Row } from '../../common/mappers'
import { estimateCost, formatCost } from '../../common/metrics.util'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class TracesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(projectId: string): Promise<TracesPayload> {
    const rows = await this.prisma.agentTrace.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    const entries = rows.map((row) => toAgentTrace(row as unknown as Row))
    return { summary: this.summarize(entries), entries }
  }

  async listByItem(itemId: string): Promise<AgentTrace[]> {
    await this.projectIdOfItem(itemId)
    const rows = await this.prisma.agentTrace.findMany({
      where: { itemId },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((row) => toAgentTrace(row as unknown as Row))
  }

  /** 条目 → 所属项目，供调用方做归属校验 */
  async projectIdOfItem(itemId: string): Promise<string> {
    const item = await this.prisma.requirementItem.findUnique({ where: { id: itemId } })
    if (!item) throw notFound(ErrorCode.NOT_FOUND, { itemId })
    return item.projectId
  }

  private summarize(entries: AgentTrace[]): TraceSummary {
    const inputTokens = entries.reduce((sum, e) => sum + e.inputTokens, 0)
    const outputTokens = entries.reduce((sum, e) => sum + e.outputTokens, 0)
    const models = new Set(entries.map((e) => e.model))
    return {
      totalCalls: entries.length,
      inputTokens,
      outputTokens,
      cost: formatCost(estimateCost(inputTokens, outputTokens)),
      modelCount: models.size,
    }
  }
}
