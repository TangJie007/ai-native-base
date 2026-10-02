import { Injectable } from '@nestjs/common'
import {
  DEFAULT_STACK_CONFIG,
  ErrorCode,
  ITEM_STATUS_META,
  PIPELINE_STAGES,
  PROJECT_STATUS_META,
  type CreateProjectDto,
  type DashboardData,
  type DashboardStat,
  type ItemStatus,
  type Project,
  type ProjectCard,
  type ProjectStats,
  type RecentProject,
  type StackConfig,
  type UpdateProjectDto,
} from '@specforge/shared'
import { conflict, forbidden, notFound } from '../../common/app-exception'
import type { Row } from '../../common/mappers'
import { toProject } from '../../common/mappers'
import { estimateCost, formatCost, formatDuration, passRate } from '../../common/metrics.util'
import { SandboxService } from '../../infra/sandbox/sandbox.service'
import { VectorService } from '../../infra/vector/vector.service'
import { PrismaService } from '../../prisma/prisma.service'

const FINISHED_STATUSES: ItemStatus[] = ['passed', 'failed', 'needs_human']

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sandbox: SandboxService,
    private readonly vectors: VectorService,
  ) {}

  /** 项目归属校验：所有子资源接口统一入口，避免越权访问他人项目 */
  async assertOwned(userId: string, projectId: string): Promise<Row> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } })
    if (!project) throw notFound(ErrorCode.NOT_FOUND, { projectId })
    if (project.userId !== userId) throw forbidden()
    return project as unknown as Row
  }

  /** 条目级归属校验：先解析条目所属项目，再校验项目归属 */
  async assertItemOwned(userId: string, itemId: string): Promise<Row> {
    const item = await this.prisma.requirementItem.findUnique({ where: { id: itemId } })
    if (!item) throw notFound(ErrorCode.NOT_FOUND, { itemId })
    await this.assertOwned(userId, item.projectId)
    return item as unknown as Row
  }

  async list(userId: string): Promise<Project[]> {
    const rows = await this.prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map((row) => toProject(row as unknown as Row))
  }

  async create(userId: string, dto: CreateProjectDto): Promise<Project> {
    const row = await this.prisma.project.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description ?? '',
        stackConfig: DEFAULT_STACK_CONFIG as unknown as object,
      },
    })
    return toProject(row as unknown as Row)
  }

  async get(userId: string, projectId: string): Promise<Project> {
    const row = await this.assertOwned(userId, projectId)
    return toProject(row)
  }

  async update(userId: string, projectId: string, dto: UpdateProjectDto): Promise<Project> {
    const current = await this.assertOwned(userId, projectId)
    const stackConfig: StackConfig = { ...(current.stackConfig as StackConfig) }
    if (dto.stackConfig) Object.assign(stackConfig, dto.stackConfig)
    const row = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        name: dto.name ?? undefined,
        description: dto.description ?? undefined,
        status: dto.status ?? undefined,
        stackConfig: stackConfig as unknown as object,
      },
    })
    return toProject(row as unknown as Row)
  }

  async remove(userId: string, projectId: string): Promise<void> {
    const project = await this.assertOwned(userId, projectId)
    // 流水线执行中禁止删除，避免与生成/校验/沙箱写入竞态（B-12）
    if (project.status === 'generating') {
      throw conflict(ErrorCode.PIPELINE_ALREADY_RUNNING, { projectId })
    }
    // 先释放外部资源（沙箱容器、向量索引），再删除数据库记录
    await this.sandbox.destroy(projectId)
    this.vectors.removeByProject(projectId)
    await this.prisma.project.delete({ where: { id: projectId } })
  }

  async stats(userId: string, projectId: string): Promise<ProjectStats> {
    const project = await this.assertOwned(userId, projectId)
    const [items, traces, run] = await Promise.all([
      this.prisma.requirementItem.findMany({ where: { projectId } }),
      this.prisma.agentTrace.findMany({ where: { projectId } }),
      this.prisma.pipelineRun.findFirst({ where: { projectId }, orderBy: { startedAt: 'desc' } }),
    ])

    const statusCounts = this.emptyStatusCounts()
    for (const item of items) {
      const key = item.status as ItemStatus
      statusCounts[key] = (statusCounts[key] ?? 0) + 1
    }

    const itemsTotal = items.length
    const itemsDone = statusCounts.passed
    const finished = FINISHED_STATUSES.reduce((sum, status) => sum + statusCounts[status], 0)
    const cost = traces.reduce((sum, t) => sum + estimateCost(t.inputTokens, t.outputTokens), 0)
    const startedAt = run?.startedAt ?? project.createdAt
    const finishedAt = run?.finishedAt ?? new Date()

    return {
      itemsTotal,
      itemsDone,
      progress: itemsTotal > 0 ? Math.round((itemsDone / itemsTotal) * 100) : 0,
      passRate: passRate(itemsDone, finished),
      cost: formatCost(cost),
      duration: formatDuration(finishedAt.getTime() - startedAt.getTime()),
      statusCounts,
    }
  }

  async dashboard(userId: string): Promise<DashboardData> {
    const projects = await this.prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    })
    if (projects.length === 0) {
      return { projects: [], stats: this.emptyStats(), recentProjects: [] }
    }

    const projectIds = projects.map((p) => p.id)
    const [items, traces, runs] = await Promise.all([
      this.prisma.requirementItem.findMany({ where: { projectId: { in: projectIds } } }),
      this.prisma.agentTrace.findMany({ where: { projectId: { in: projectIds } } }),
      this.prisma.pipelineRun.findMany({
        where: { projectId: { in: projectIds } },
        orderBy: { startedAt: 'desc' },
      }),
    ])

    const itemsByProject = this.groupBy(items, (i) => i.projectId)
    const tracesByProject = this.groupBy(traces, (t) => t.projectId)
    const runByProject = new Map<string, Row>()
    for (const run of runs) {
      if (!runByProject.has(run.projectId)) runByProject.set(run.projectId, run as unknown as Row)
    }

    const cards: ProjectCard[] = []
    const recent: RecentProject[] = []
    let totalCost = 0
    let totalItems = 0
    let totalPassed = 0

    for (const project of projects) {
      const projectItems = itemsByProject.get(project.id) ?? []
      const projectTraces = tracesByProject.get(project.id) ?? []
      const run = runByProject.get(project.id)

      const itemsTotal = projectItems.length
      const passed = projectItems.filter((i) => i.status === 'passed').length
      const finished = projectItems.filter((i) => FINISHED_STATUSES.includes(i.status as ItemStatus)).length
      const cost = projectTraces.reduce((sum, t) => sum + estimateCost(t.inputTokens, t.outputTokens), 0)
      const startedAt = run?.startedAt ?? project.createdAt
      const finishedAt = run?.finishedAt ?? new Date()

      totalItems += itemsTotal
      totalPassed += passed
      totalCost += cost

      const stageLabel = this.stageLabel(project.currentStage)
      const progress = itemsTotal > 0 ? Math.round((passed / itemsTotal) * 100) : 0
      const rate = passRate(passed, finished)

      cards.push({
        id: project.id,
        name: project.name,
        subtitle: project.description || `${itemsTotal} 个需求条目`,
        progress,
        itemsDone: passed,
        itemsTotal,
        passRate: rate,
        cost: formatCost(cost),
        duration: formatDuration(finishedAt.getTime() - startedAt.getTime()),
        features: projectItems.slice(0, 3).map((i) => i.title),
        stage: stageLabel,
      })

      recent.push({
        id: project.id,
        name: project.name,
        stage: stageLabel,
        status: project.status as RecentProject['status'],
        statusLabel: PROJECT_STATUS_META[project.status as RecentProject['status']]?.label ?? project.status,
        updatedAt: project.updatedAt.toISOString(),
        passRate: rate,
      })
    }

    const stats: DashboardStat[] = [
      { value: String(projects.length), label: '项目总数', suffix: '个' },
      { value: String(totalItems), label: '需求条目', suffix: '条' },
      { value: passRate(totalPassed, totalItems), label: '平均通过率', suffix: '' },
      { value: totalCost.toFixed(2), label: '累计成本', suffix: '元' },
    ]

    return { projects: cards, stats, recentProjects: recent.slice(0, 5) }
  }

  private stageLabel(stage: string): string {
    const found = PIPELINE_STAGES.find((s) => s.key === stage)
    return found ? `${found.key} ${found.label}` : stage
  }

  private emptyStatusCounts(): Record<ItemStatus, number> {
    const counts = {} as Record<ItemStatus, number>
    for (const status of Object.keys(ITEM_STATUS_META) as ItemStatus[]) counts[status] = 0
    return counts
  }

  private emptyStats(): DashboardStat[] {
    return [
      { value: '0', label: '项目总数', suffix: '个' },
      { value: '0', label: '需求条目', suffix: '条' },
      { value: '—', label: '平均通过率', suffix: '' },
      { value: '0.00', label: '累计成本', suffix: '元' },
    ]
  }

  private groupBy<T>(list: T[], key: (item: T) => string): Map<string, T[]> {
    const map = new Map<string, T[]>()
    for (const item of list) {
      const k = key(item)
      const bucket = map.get(k)
      if (bucket) bucket.push(item)
      else map.set(k, [item])
    }
    return map
  }
}
