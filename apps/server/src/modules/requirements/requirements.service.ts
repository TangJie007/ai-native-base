import { Injectable } from '@nestjs/common'
import {
  ErrorCode,
  type Assumption,
  type CreateItemDto,
  type ImportRequirementDocDto,
  type ParsedSpec,
  type RequirementDoc,
  type RequirementItem,
  type StackConfig,
  type UpdateItemDto,
} from '@specforge/shared'
import { conflict } from '../../common/app-exception'
import { toAssumption, toRequirementDoc, toRequirementItem, type Row } from '../../common/mappers'
import { LlmService } from '../../infra/llm/llm.service'
import { VectorService } from '../../infra/vector/vector.service'
import { PrismaService } from '../../prisma/prisma.service'
import { ProjectsService } from '../projects/projects.service'
import { TraceService } from '../traces/trace.service'

export interface RequirementsPayload {
  doc: RequirementDoc | null
  spec: ParsedSpec | null
  items: RequirementItem[]
}

const LAYER_PREFIX: Record<RequirementItem['layer'], string> = {
  backend: 'BE',
  frontend: 'FE',
  data: 'DB',
  fullstack: 'FS',
}

export interface ImportRequirementsResult extends RequirementsPayload {
  assumptions: Assumption[]
}

@Injectable()
export class RequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly llm: LlmService,
    private readonly traces: TraceService,
    private readonly vectors: VectorService,
  ) {}

  async get(projectId: string): Promise<RequirementsPayload> {
    const [doc, items] = await Promise.all([
      this.prisma.requirementDoc.findFirst({ where: { projectId }, orderBy: { version: 'desc' } }),
      this.prisma.requirementItem.findMany({ where: { projectId }, orderBy: { code: 'asc' } }),
    ])
    return {
      doc: doc ? toRequirementDoc(doc as unknown as Row) : null,
      spec: doc ? ((doc.parsedSpec as ParsedSpec | null) ?? null) : null,
      items: items.map((item) => toRequirementItem(item as unknown as Row)),
    }
  }

  /** S1：导入需求文档 → LLM 解析 → 落库条目与假设（PRD 4.2 / 6.1 卡点一） */
  async import(
    userId: string,
    projectId: string,
    dto: ImportRequirementDocDto,
  ): Promise<ImportRequirementsResult> {
    const project = await this.projects.assertOwned(userId, projectId)
    const stackConfig = project.stackConfig as StackConfig

    const parsed = await this.traces.track(
      {
        projectId,
        action: 'S1 需求解析',
        inputSummary: `${dto.fileName}（${dto.content.length} 字）`,
        agent: 'parser',
      },
      () =>
        this.llm.parseRequirement(userId, {
          content: dto.content,
          fileName: dto.fileName,
          projectName: project.name,
          stackConfig,
        }),
    )

    const lastDoc = await this.prisma.requirementDoc.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    })
    const version = (lastDoc?.version ?? 0) + 1

    // 重新导入即整体替换：条目与假设都以上一版为准重新生成
    const usedCodes = new Set<string>()
    const itemRows = parsed.items.map((item, index) => {
      const code = this.uniqueCode(item.code, index, usedCodes)
      return {
        projectId,
        code,
        title: item.title,
        description: item.description,
        acceptance: item.acceptance as unknown as object,
        dependsOn: item.dependsOn as unknown as object,
        layer: item.layer,
        priority: item.priority,
        status: 'pending',
      }
    })

    const spec: ParsedSpec = {
      ...parsed.spec,
      summary: {
        ...parsed.spec.summary,
        itemCount: parsed.items.length,
        assumptionCount: parsed.assumptions.length,
      },
    }

    // 整体替换须原子完成：任一步失败都回滚，避免条目/假设/文档版本错位（B-4）
    const doc = await this.prisma.$transaction(async (tx) => {
      await tx.itemDependency.deleteMany({ where: { projectId } })
      await tx.assumption.deleteMany({ where: { projectId } })
      await tx.requirementItem.deleteMany({ where: { projectId } })
      await tx.requirementItem.createMany({ data: itemRows })

      const createdDoc = await tx.requirementDoc.create({
        data: {
          projectId,
          version,
          fileName: dto.fileName,
          rawContent: dto.content,
          parsedSpec: spec as unknown as object,
        },
      })

      if (parsed.assumptions.length > 0) {
        await tx.assumption.createMany({
          data: parsed.assumptions.map((assumption) => ({
            docId: createdDoc.id,
            projectId,
            code: assumption.code,
            category: assumption.category,
            question: assumption.question,
            aiDefault: assumption.aiDefault,
            impact: assumption.impact,
            status: 'pending',
          })),
        })
      }

      await tx.project.update({
        where: { id: projectId },
        data: { status: 'awaiting_assumptions', currentStage: 'S1', depsConfirmed: false },
      })

      return createdDoc
    })

    // 落到向量库，供后续契约/代码生成做相似片段召回（PRD 8.1）
    this.vectors.upsert({
      ownerType: 'requirement_doc',
      ownerId: doc.id,
      projectId,
      model: 'pseudo-bow-64',
      text: dto.content,
    })

    const result = await this.get(projectId)
    const assumptions = await this.prisma.assumption.findMany({ where: { projectId }, orderBy: { code: 'asc' } })
    return {
      ...result,
      assumptions: assumptions.map((row) => toAssumption(row as unknown as Row)),
    }
  }

  async listItems(projectId: string): Promise<RequirementItem[]> {
    const rows = await this.prisma.requirementItem.findMany({
      where: { projectId },
      orderBy: { code: 'asc' },
    })
    return rows.map((row) => toRequirementItem(row as unknown as Row))
  }

  async createItem(projectId: string, dto: CreateItemDto): Promise<RequirementItem> {
    const existing = await this.prisma.requirementItem.findMany({
      where: { projectId },
      select: { code: true },
    })
    const used = new Set(existing.map((i) => i.code))
    const code = this.uniqueCode(`${LAYER_PREFIX[dto.layer]}-001`, existing.length, used)
    const row = await this.prisma.requirementItem.create({
      data: {
        projectId,
        code,
        title: dto.title,
        description: dto.description ?? '',
        acceptance: (dto.acceptance ?? []) as unknown as object,
        dependsOn: (dto.dependsOn ?? []) as unknown as object,
        layer: dto.layer,
        priority: dto.priority,
      },
    })
    return toRequirementItem(row as unknown as Row)
  }

  async updateItem(itemId: string, dto: UpdateItemDto): Promise<RequirementItem> {
    const row = await this.prisma.requirementItem.update({
      where: { id: itemId },
      data: {
        title: dto.title ?? undefined,
        description: dto.description ?? undefined,
        acceptance: dto.acceptance ? (dto.acceptance as unknown as object) : undefined,
        dependsOn: dto.dependsOn ? (dto.dependsOn as unknown as object) : undefined,
        layer: dto.layer ?? undefined,
        priority: dto.priority ?? undefined,
      },
    })
    return toRequirementItem(row as unknown as Row)
  }

  async removeItem(itemId: string): Promise<void> {
    const item = await this.prisma.requirementItem.findUnique({ where: { id: itemId } })
    if (!item) return
    // 流水线执行中禁止删除条目，避免与生成/校验竞态（B-14）
    const project = await this.prisma.project.findUnique({ where: { id: item.projectId } })
    if (project?.status === 'generating') {
      throw conflict(ErrorCode.PIPELINE_ALREADY_RUNNING, { projectId: item.projectId })
    }
    await this.prisma.itemDependency.deleteMany({
      where: { OR: [{ itemId }, { dependsOnId: itemId }] },
    })
    await this.prisma.requirementItem.delete({ where: { id: itemId } })
  }

  async projectIdOfItem(itemId: string): Promise<string> {
    const item = await this.prisma.requirementItem.findUnique({ where: { id: itemId } })
    return item?.projectId ?? ''
  }

  private uniqueCode(raw: string, index: number, used: Set<string>): string {
    const base = raw?.trim() || `REQ-${String(index + 1).padStart(3, '0')}`
    let code = base
    let suffix = 1
    while (used.has(code)) {
      code = `${base}-${suffix}`
      suffix += 1
    }
    used.add(code)
    return code
  }
}
