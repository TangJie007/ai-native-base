import { Injectable } from '@nestjs/common'
import {
  ErrorCode,
  type DAGEdge,
  type DependencyGraph,
  type RequirementItem,
  type SaveDependenciesDto,
} from '@specforge/shared'
import { badRequest, conflict } from '../../common/app-exception'
import { buildBatches } from '../../common/dag.util'
import { toRequirementItem, type Row } from '../../common/mappers'
import { LlmService } from '../../infra/llm/llm.service'
import { PrismaService } from '../../prisma/prisma.service'
import { ContractsService } from '../contracts/contracts.service'
import { ProjectsService } from '../projects/projects.service'
import { TraceService } from '../traces/trace.service'

/**
 * S3 依赖编排（PRD 4.4 / 3.3）：
 * 由 Architect Agent 产出条目间依赖，拓扑分层为可并行的执行批次；
 * 依赖图是卡点三，必须人工确认（depsConfirmed）后才能进入 S4。
 */
@Injectable()
export class DependenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly contracts: ContractsService,
    private readonly llm: LlmService,
    private readonly traces: TraceService,
  ) {}

  async get(projectId: string): Promise<DependencyGraph> {
    const [project, itemRows, depRows] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: projectId } }),
      this.prisma.requirementItem.findMany({ where: { projectId }, orderBy: { code: 'asc' } }),
      this.prisma.itemDependency.findMany({ where: { projectId } }),
    ])

    const byId = new Map(itemRows.map((row) => [row.id, row]))
    const edges: DAGEdge[] = []
    for (const dep of depRows) {
      const item = byId.get(dep.itemId)
      const dependsOn = byId.get(dep.dependsOnId)
      if (!item || !dependsOn) continue
      edges.push({
        id: dep.id,
        itemId: dep.itemId,
        itemCode: item.code,
        itemTitle: item.title,
        itemLayer: item.layer as RequirementItem['layer'],
        dependsOnId: dep.dependsOnId,
        dependsOnCode: dependsOn.code,
        depType: dep.depType as DAGEdge['depType'],
      })
    }

    const { batches, cycleRemoved } = buildBatches(
      itemRows.map((row) => ({
        id: row.id,
        code: row.code,
        title: row.title,
        layer: row.layer as RequirementItem['layer'],
      })),
      edges.map((edge) => ({ itemId: edge.itemId, dependsOnId: edge.dependsOnId })),
    )

    return {
      projectId,
      confirmed: Boolean(project?.depsConfirmed),
      edges,
      batches,
      cycleRemoved,
    }
  }

  /** 调用 Architect Agent 分析依赖；需契约已锁定（卡点二通过） */
  async generate(userId: string, projectId: string): Promise<DependencyGraph> {
    await this.projects.assertOwned(userId, projectId)

    const contract = await this.contracts.lockedContract(projectId)
    if (!contract) throw conflict(ErrorCode.CONTRACT_NOT_LOCKED, { projectId })

    const itemRows = await this.prisma.requirementItem.findMany({
      where: { projectId },
      orderBy: { code: 'asc' },
    })
    if (itemRows.length === 0) throw conflict(ErrorCode.NO_REQUIREMENT_ITEMS, { projectId })

    const items = itemRows.map((row) => toRequirementItem(row as unknown as Row))
    const generated = await this.traces.track(
      { projectId, action: 'S3 依赖分析', inputSummary: `${items.length} 个条目` },
      () => this.llm.analyzeDependencies({ items, contract }),
    )

    const byCode = new Map(items.map((item) => [item.code, item]))
    const seen = new Set<string>()
    const data: { projectId: string; itemId: string; dependsOnId: string; depType: string }[] = []
    for (const dep of generated) {
      const item = byCode.get(dep.itemCode)
      const dependsOn = byCode.get(dep.dependsOnCode)
      if (!item || !dependsOn || item.id === dependsOn.id) continue
      const key = `${item.id}->${dependsOn.id}`
      if (seen.has(key)) continue
      seen.add(key)
      data.push({ projectId, itemId: item.id, dependsOnId: dependsOn.id, depType: dep.depType })
    }

    await this.prisma.itemDependency.deleteMany({ where: { projectId } })
    if (data.length > 0) await this.prisma.itemDependency.createMany({ data })

    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'awaiting_dependencies', currentStage: 'S3', depsConfirmed: false },
    })
    return this.get(projectId)
  }

  /** 人工在依赖图上增删边后保存，视为未确认状态 */
  async save(userId: string, projectId: string, dto: SaveDependenciesDto): Promise<DependencyGraph> {
    await this.projects.assertOwned(userId, projectId)

    const itemRows = await this.prisma.requirementItem.findMany({
      where: { projectId },
      select: { id: true },
    })
    const ids = new Set(itemRows.map((row) => row.id))

    const seen = new Set<string>()
    const data: { projectId: string; itemId: string; dependsOnId: string; depType: string }[] = []
    for (const edge of dto.edges) {
      if (!ids.has(edge.itemId) || !ids.has(edge.dependsOnId)) {
        throw badRequest(ErrorCode.VALIDATION_FAILED, {
          reason: '依赖边引用了不属于该项目的条目',
          edge,
        })
      }
      if (edge.itemId === edge.dependsOnId) {
        throw badRequest(ErrorCode.VALIDATION_FAILED, { reason: '条目不能依赖自身', edge })
      }
      const key = `${edge.itemId}->${edge.dependsOnId}`
      if (seen.has(key)) continue
      seen.add(key)
      data.push({ projectId, itemId: edge.itemId, dependsOnId: edge.dependsOnId, depType: edge.depType })
    }

    await this.prisma.itemDependency.deleteMany({ where: { projectId } })
    if (data.length > 0) await this.prisma.itemDependency.createMany({ data })

    await this.prisma.project.update({ where: { id: projectId }, data: { depsConfirmed: false } })
    return this.get(projectId)
  }

  /** 卡点三：确认依赖图，放行 S4 代码生成 */
  async confirm(userId: string, projectId: string): Promise<DependencyGraph> {
    await this.projects.assertOwned(userId, projectId)

    const count = await this.prisma.requirementItem.count({ where: { projectId } })
    if (count === 0) throw conflict(ErrorCode.NO_REQUIREMENT_ITEMS, { projectId })

    await this.prisma.project.update({
      where: { id: projectId },
      data: { depsConfirmed: true, status: 'generating', currentStage: 'S4' },
    })
    return this.get(projectId)
  }
}
