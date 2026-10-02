import { Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_FIX_ROUNDS,
  ERROR_MESSAGES,
  ErrorCode,
  PIPELINE_STAGES,
  VERIFICATION_CHECK_META,
  type CheckRegressionDto,
  type Contract,
  type ErrorSnapshot,
  type ExecutionBatch,
  type FixRecord,
  type ItemStatus,
  type PipelineStatus,
  type RegressionItem,
  type RequirementItem,
  type ResolveItemDto,
  type StackConfig,
  type StageInfo,
  type StageKey,
  type StartPipelineDto,
  type VerificationCheckType,
  type VerificationRun,
} from '@specforge/shared'
import { conflict } from '../../common/app-exception'
import {
  toFixRecord,
  toRegressionItem,
  toRequirementItem,
  toVerificationRun,
  type Row,
} from '../../common/mappers'
import type { FixAttempt, GeneratedFile } from '../../infra/llm/llm.types'
import { LlmService } from '../../infra/llm/llm.service'
import { SandboxService } from '../../infra/sandbox/sandbox.service'
import type { SandboxCheckResult } from '../../infra/sandbox/sandbox.types'
import { PrismaService } from '../../prisma/prisma.service'
import { AssumptionsService } from '../assumptions/assumptions.service'
import { ContractsService } from '../contracts/contracts.service'
import { DependenciesService } from '../dependencies/dependencies.service'
import { ProjectsService } from '../projects/projects.service'
import { PipelineGateway } from '../realtime/pipeline.gateway'
import { TraceService } from '../traces/trace.service'

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

interface RunContext {
  concurrency: number
  maxFixRounds: number
}

/**
 * S4/S5 流水线编排（PRD 4.4 / 4.6 / 5.1）：
 * 按依赖批次并发执行条目生成 → 沙箱校验 → 失败自动修复（轮次上限）→ 复测；
 * 失败不阻塞其它条目；全部结束后生成人工回归清单（卡点四）。
 */
@Injectable()
export class PipelineService implements OnModuleInit {
  private readonly logger = new Logger(PipelineService.name)
  /** 正在执行的项目，避免重复启动 */
  private readonly active = new Set<string>()
  /** 收到中断请求的项目，在批次边界停下 */
  private readonly interrupted = new Set<string>()
  /** 流水线运行期间提交的重跑请求，待本轮结束后唤醒执行（B-2） */
  private readonly pendingRetries = new Map<string, Set<string>>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly projects: ProjectsService,
    private readonly assumptions: AssumptionsService,
    private readonly contracts: ContractsService,
    private readonly dependencies: DependenciesService,
    private readonly llm: LlmService,
    private readonly sandbox: SandboxService,
    private readonly traces: TraceService,
    private readonly gateway: PipelineGateway,
  ) {}

  /* ------------------------------ 生命周期 ------------------------------ */

  /** 进程重启后清理遗留的「运行中」流水线记录，避免状态永久锁死在 generating */
  async onModuleInit(): Promise<void> {
    try {
      const { count } = await this.prisma.pipelineRun.updateMany({
        where: { running: true },
        data: { running: false, finishedAt: new Date() },
      })
      await this.prisma.project.updateMany({
        where: { status: 'generating' },
        data: { status: 'paused' },
      })
      if (count > 0) this.logger.warn(`启动时清理 ${count} 条未正常结束的流水线记录`)
    } catch (error) {
      this.logger.error(`清理遗留流水线记录失败：${messageOf(error)}`)
    }
  }

  /* ------------------------------ 查询 ------------------------------ */

  async status(userId: string, projectId: string): Promise<PipelineStatus> {
    await this.projects.assertOwned(userId, projectId)
    return this.buildStatus(projectId)
  }

  async listVerifications(userId: string, itemId: string): Promise<VerificationRun[]> {
    await this.projects.assertItemOwned(userId, itemId)
    const rows = await this.prisma.verificationRun.findMany({
      where: { itemId },
      orderBy: [{ round: 'asc' }, { createdAt: 'asc' }],
    })
    return rows.map((row) => toVerificationRun(row as unknown as Row))
  }

  async listFixes(userId: string, itemId: string): Promise<FixRecord[]> {
    await this.projects.assertItemOwned(userId, itemId)
    const rows = await this.prisma.fixRecord.findMany({
      where: { itemId },
      orderBy: [{ round: 'asc' }, { createdAt: 'asc' }],
    })
    return rows.map((row) => toFixRecord(row as unknown as Row))
  }

  async listRegression(userId: string, projectId: string): Promise<RegressionItem[]> {
    await this.projects.assertOwned(userId, projectId)
    const rows = await this.prisma.regressionItem.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map((row) => toRegressionItem(row as unknown as Row))
  }

  /* ------------------------------ 启动 / 中断 ------------------------------ */

  async start(userId: string, projectId: string, dto: StartPipelineDto): Promise<PipelineStatus> {
    if (this.active.has(projectId)) throw conflict(ErrorCode.PIPELINE_ALREADY_RUNNING, { projectId })

    // 先占位再加锁：避免后续 await 窗口内并发重复启动同一项目
    this.active.add(projectId)
    try {
      const project = await this.projects.assertOwned(userId, projectId)

      // 三个强阻断卡点必须全部通过（PRD 6.1）
      const gate = await this.assumptions.gate(projectId)
      if (!gate.allowed) throw conflict(ErrorCode.ASSUMPTIONS_PENDING, gate)

      const contract = await this.contracts.lockedContract(projectId)
      if (!contract) throw conflict(ErrorCode.CONTRACT_NOT_LOCKED, { projectId })

      if (!project.depsConfirmed) throw conflict(ErrorCode.DEPENDENCIES_NOT_CONFIRMED, { projectId })

      const itemCount = await this.prisma.requirementItem.count({ where: { projectId } })
      if (itemCount === 0) throw conflict(ErrorCode.NO_REQUIREMENT_ITEMS, { projectId })

      const concurrency =
        dto.concurrency ?? this.config.get<number>('pipelineConcurrency') ?? DEFAULT_CONCURRENCY
      const maxFixRounds =
        dto.maxFixRounds ?? this.config.get<number>('maxFixRounds') ?? DEFAULT_MAX_FIX_ROUNDS

      await this.prisma.pipelineRun.updateMany({
        where: { projectId, running: true },
        data: { running: false, finishedAt: new Date() },
      })
      await this.prisma.pipelineRun.create({
        data: { projectId, running: true, currentStage: 'S4', concurrency, maxFixRounds },
      })
      await this.prisma.requirementItem.updateMany({
        where: { projectId },
        data: { status: 'pending', retryCount: 0, errorSnapshot: Prisma.DbNull },
      })
      await this.prisma.project.update({
        where: { id: projectId },
        data: { status: 'generating', currentStage: 'S4' },
      })

      this.interrupted.delete(projectId)
      await this.emitStatus(projectId)

      // 后台执行，接口立即返回最新状态，进度经 WebSocket 推送
      void this.runAll(projectId, { concurrency, maxFixRounds }).catch((error) => {
        this.logger.error(`流水线执行失败 ${projectId}：${messageOf(error)}`)
        // 兜底释放占位，避免异常路径下项目被永久锁死
        this.active.delete(projectId)
      })

      return this.buildStatus(projectId)
    } catch (error) {
      this.active.delete(projectId)
      throw error
    }
  }

  async interrupt(userId: string, projectId: string): Promise<PipelineStatus> {
    await this.projects.assertOwned(userId, projectId)
    if (!this.active.has(projectId)) throw conflict(ErrorCode.PIPELINE_NOT_RUNNING, { projectId })

    this.interrupted.add(projectId)
    await this.prisma.project.update({ where: { id: projectId }, data: { status: 'paused' } })
    await this.emitStatus(projectId)
    return this.buildStatus(projectId)
  }

  /** 人工处理失败/待人工条目（PRD 6.2） */
  async resolveItem(userId: string, itemId: string, dto: ResolveItemDto): Promise<RequirementItem> {
    const item = await this.projects.assertItemOwned(userId, itemId)
    const status = item.status as RequirementItem['status']
    // blocked 条目（依赖未通过被阻断）也允许人工重跑（B-9）；passed 已通过，无需重跑
    if (!['failed', 'needs_human', 'blocked'].includes(status)) {
      throw conflict(ErrorCode.ITEM_NOT_RESOLVABLE, { status })
    }

    if (dto.action === 'retry') {
      const updated = await this.updateItem(itemId, {
        status: 'pending',
        retryCount: 0,
        errorSnapshot: Prisma.DbNull,
      })
      if (this.active.has(item.projectId)) {
        // 流水线运行中：登记待唤醒，本轮结束后自动重跑，避免请求静默失效（B-2）
        this.queueRetry(item.projectId, itemId)
      } else {
        void this.runSingle(item.projectId, itemId).catch((error) =>
          this.logger.error(`单条目重跑失败 ${itemId}：${messageOf(error)}`),
        )
      }
      return updated
    }

    // skip / mark_passed：统一记为「已通过」（ItemStatus 无 skipped，跳过项计入通过率，语义从简）
    return this.updateItem(itemId, { status: 'passed', errorSnapshot: Prisma.DbNull })
  }

  /** 人工回归勾选，全部勾完即交付（PRD 3.4 VER-08） */
  async checkRegression(
    userId: string,
    projectId: string,
    dto: CheckRegressionDto,
  ): Promise<PipelineStatus> {
    await this.projects.assertOwned(userId, projectId)
    // 流水线运行期间回归清单仍在重建，禁止勾选，避免误判全部通过而提前交付
    if (this.active.has(projectId)) throw conflict(ErrorCode.PIPELINE_ALREADY_RUNNING, { projectId })

    await this.prisma.regressionItem.updateMany({
      where: { projectId, itemId: dto.itemId, text: dto.text },
      data: { checked: dto.checked },
    })

    const [total, unchecked] = await Promise.all([
      this.prisma.regressionItem.count({ where: { projectId } }),
      this.prisma.regressionItem.count({ where: { projectId, checked: false } }),
    ])
    if (total > 0 && unchecked === 0) {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { status: 'delivered', currentStage: 'S5' },
      })
    }

    await this.emitStatus(projectId)
    return this.buildStatus(projectId)
  }

  /* ------------------------------ 执行内核 ------------------------------ */

  private async runAll(projectId: string, ctx: RunContext): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } })
    if (!project) return

    const contract = await this.contracts.lockedContract(projectId)
    const itemRows = await this.prisma.requirementItem.findMany({
      where: { projectId },
      orderBy: { code: 'asc' },
    })
    const byId = new Map(itemRows.map((row) => [row.id, row]))

    let batches: ExecutionBatch[]
    // 条目 → 其依赖集合，用于依赖未通过时阻断下游条目（B-9）
    const depsOf = new Map<string, Set<string>>()
    try {
      const graph = await this.dependencies.get(projectId)
      batches = graph.batches
      for (const edge of graph.edges) {
        const set = depsOf.get(edge.itemId) ?? new Set<string>()
        set.add(edge.dependsOnId)
        depsOf.set(edge.itemId, set)
      }
    } catch (error) {
      this.logger.warn(`依赖图读取失败，退化为单批并行：${messageOf(error)}`)
      batches = [this.singleBatch(itemRows)]
    }
    if (batches.length === 0) batches = [this.singleBatch(itemRows)]

    // 运行期状态镜像：批次按拓扑排序，下游可据此判断依赖是否已通过
    const statusById = new Map<string, ItemStatus>(itemRows.map((row) => [row.id, 'pending']))

    let interrupted = false
    try {
      outer: for (const batch of batches) {
        for (let index = 0; index < batch.nodes.length; index += ctx.concurrency) {
          if (this.interrupted.has(projectId)) {
            interrupted = true
            break outer
          }
          const slice = batch.nodes.slice(index, index + ctx.concurrency)
          await Promise.all(
            slice.map(async (node) => {
              const item = byId.get(node.id)
              if (!item) return
              const deps = depsOf.get(node.id)
              if (deps && [...deps].some((depId) => statusById.get(depId) !== 'passed')) {
                // 依赖未通过：标记 blocked，不生成代码，避免产出不可用产物（B-9）
                const blocked = await this.updateItem(item.id, { status: 'blocked' })
                statusById.set(item.id, blocked.status as ItemStatus)
                return
              }
              const status = await this.processItem(
                project as unknown as Row,
                item as unknown as Row,
                contract,
                ctx,
              )
              statusById.set(item.id, status)
            }),
          )
        }
      }
    } catch (error) {
      this.logger.error(`流水线异常 ${projectId}：${messageOf(error)}`)
      interrupted = false
      await this.finish(projectId, false, true)
      this.interrupted.delete(projectId)
      this.active.delete(projectId)
      await this.drainPendingRetries(projectId)
      return
    }

    const wasInterrupted = this.interrupted.has(projectId)
    this.interrupted.delete(projectId)
    // 先落终态再释放占位：收尾期间 active 仍被持有，防止新任务在 finish/drain 窗口重入（M6）
    await this.finish(projectId, wasInterrupted || interrupted, false)
    this.active.delete(projectId)
    await this.drainPendingRetries(projectId)
  }

  private async processItem(
    project: Row,
    item: Row,
    contract: Contract | null,
    ctx: RunContext,
  ): Promise<ItemStatus> {
    try {
      await this.updateItem(item.id, { status: 'generating' })

      const files = await this.traces.track(
        {
          projectId: project.id,
          itemId: item.id,
          action: `S4 代码生成 ${item.code}`,
          inputSummary: item.title,
          agent: item.layer === 'frontend' ? 'frontend' : 'backend',
        },
        () =>
          this.llm.generateItemCode(project.userId as string, {
            item: toRequirementItem(item),
            contract,
            stackConfig: project.stackConfig as StackConfig,
          }),
      )

      const stored = await this.sandbox.write(project.id, files)
      this.gateway.emitSandboxFiles(project.id, stored)
      await this.updateItem(item.id, {
        filePaths: stored.map((file) => file.path) as unknown as object,
      })

      return await this.verifyAndFix(project, item, files, ctx)
    } catch (error) {
      // 单条目失败不影响其它条目（PRD 7.2 失败不阻塞）
      await this.updateItem(item.id, {
        status: 'failed',
        errorSnapshot: this.snapshot('build', 1, messageOf(error)) as unknown as object,
      }).catch((updateError) =>
        this.logger.error(`条目失败状态写入异常 ${item.code}：${messageOf(updateError)}`),
      )
      return 'failed'
    }
  }

  private async verifyAndFix(
    project: Row,
    item: Row,
    files: GeneratedFile[],
    ctx: RunContext,
  ): Promise<ItemStatus> {
    let currentFiles = files
    let round = 0
    // 累计各轮修复尝试，供下一轮参考，避免重复无效方案（PRD 7.2）
    const history: FixAttempt[] = []

    for (;;) {
      await this.updateItem(item.id, { status: 'verifying' })
      const results = await this.sandbox.runChecks(
        project.id,
        toRequirementItem(item),
        round + 1,
        currentFiles,
      )
      await this.persistVerifications(item.id, round + 1, results)

      const blocking = results.find(
        (result) => !result.passed && VERIFICATION_CHECK_META[result.checkType].blocking,
      )
      if (!blocking) {
        await this.updateItem(item.id, {
          status: 'passed',
          retryCount: round,
          errorSnapshot: Prisma.DbNull,
        })
        return 'passed'
      }

      if (round >= ctx.maxFixRounds) {
        await this.markNeedsHuman(item.id, round, blocking)
        return 'needs_human'
      }

      round += 1
      const errorSnapshot = this.snapshot(blocking.checkType, round, blocking.errorLog ?? '')
      await this.updateItem(item.id, {
        status: 'fixing',
        retryCount: round,
        errorSnapshot: errorSnapshot as unknown as object,
      })

      const fix = await this.traces.track(
        {
          projectId: project.id,
          itemId: item.id,
          action: `S5 修复 ${item.code} 第 ${round} 轮`,
          inputSummary: errorSnapshot.message,
          agent: 'fixer',
        },
        () =>
          this.llm.fixError(project.userId as string, {
            item: toRequirementItem(item),
            error: errorSnapshot,
            files: currentFiles,
            round,
            history: [...history],
          }),
      )

      currentFiles = this.mergeFiles(currentFiles, fix.files)
      const stored = await this.sandbox.write(project.id, currentFiles)
      this.gateway.emitSandboxFiles(project.id, stored)
      await this.updateItem(item.id, {
        filePaths: stored.map((file) => file.path) as unknown as object,
      })
      await this.persistFix(item.id, round, errorSnapshot, fix.patch, 'success')
      history.push({
        round,
        checkType: blocking.checkType,
        message: errorSnapshot.message,
        output: errorSnapshot.output,
        patch: fix.patch,
      })
    }
  }

  /** 单条目重跑：重新生成 → 校验 → 修复，结束后刷新回归清单 */
  private async runSingle(projectId: string, itemId: string): Promise<void> {
    // 已有任务在跑则登记待唤醒，避免与主批次并发写同一项目状态（M2）
    if (this.active.has(projectId)) {
      this.queueRetry(projectId, itemId)
      return
    }
    this.active.add(projectId)
    try {
      const [project, item] = await Promise.all([
        this.prisma.project.findUnique({ where: { id: projectId } }),
        this.prisma.requirementItem.findUnique({ where: { id: itemId } }),
      ])
      if (!project || !item) return

      const contract = await this.contracts.lockedContract(projectId)
      const run = await this.prisma.pipelineRun.findFirst({
        where: { projectId },
        orderBy: { startedAt: 'desc' },
      })
      const ctx: RunContext = {
        concurrency:
          run?.concurrency ?? this.config.get<number>('pipelineConcurrency') ?? DEFAULT_CONCURRENCY,
        maxFixRounds:
          run?.maxFixRounds ?? this.config.get<number>('maxFixRounds') ?? DEFAULT_MAX_FIX_ROUNDS,
      }

      await this.prisma.project.update({
        where: { id: projectId },
        data: { status: 'generating', currentStage: 'S4' },
      })
      await this.emitStatus(projectId)

      const status = await this.processItem(project as unknown as Row, item as unknown as Row, contract, ctx)

      // 仅在条目真正执行后推进到 S5；blocked（依赖未通过、未生成）保持原状态
      if (status !== 'blocked') {
        await this.prisma.project.update({
          where: { id: projectId },
          data: { status: 'awaiting_regression', currentStage: 'S5' },
        })
        await this.buildRegression(projectId)
      }
    } finally {
      this.active.delete(projectId)
      await this.emitStatus(projectId)
      await this.drainPendingRetries(projectId)
    }
  }

  /** 登记运行期间的重跑请求（B-2） */
  private queueRetry(projectId: string, itemId: string): void {
    const set = this.pendingRetries.get(projectId) ?? new Set<string>()
    set.add(itemId)
    this.pendingRetries.set(projectId, set)
  }

  /** 流水线空闲后唤醒期间登记的重跑条目（B-2） */
  private async drainPendingRetries(projectId: string): Promise<void> {
    const items = this.pendingRetries.get(projectId)
    if (!items || items.size === 0) return
    // 先清空再执行，避免 runSingle 内部再次触发时重复处理
    this.pendingRetries.delete(projectId)
    for (const itemId of items) {
      try {
        await this.runSingle(projectId, itemId)
      } catch (error) {
        this.logger.error(`唤醒重跑失败 ${itemId}：${messageOf(error)}`)
      }
    }
  }

  private async finish(projectId: string, interrupted: boolean, errored: boolean): Promise<void> {
    const status = interrupted ? 'paused' : errored ? 'failed' : 'awaiting_regression'
    const currentStage: StageKey = interrupted ? 'S4' : 'S5'

    await this.prisma.pipelineRun.updateMany({
      where: { projectId, running: true },
      data: { running: false, finishedAt: new Date(), currentStage },
    })
    await this.prisma.project.update({
      where: { id: projectId },
      data: { status, currentStage },
    })

    if (!interrupted && !errored) await this.buildRegression(projectId)
    await this.emitStatus(projectId)
  }

  /* ------------------------------ 内部工具 ------------------------------ */

  private async buildStatus(projectId: string): Promise<PipelineStatus> {
    const [project, run, regression, items] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: projectId } }),
      this.prisma.pipelineRun.findFirst({ where: { projectId }, orderBy: { startedAt: 'desc' } }),
      this.prisma.regressionItem.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.requirementItem.findMany({ where: { projectId }, select: { status: true } }),
    ])

    const currentStage = (project?.currentStage ?? 'S1') as StageKey
    const concurrency =
      run?.concurrency ?? this.config.get<number>('pipelineConcurrency') ?? DEFAULT_CONCURRENCY
    const maxFixRounds =
      run?.maxFixRounds ?? this.config.get<number>('maxFixRounds') ?? DEFAULT_MAX_FIX_ROUNDS

    let passed = 0
    let failed = 0
    let needsHuman = 0
    let blocked = 0
    let inFlight = 0
    for (const item of items) {
      if (item.status === 'passed') passed += 1
      else if (item.status === 'failed') failed += 1
      else if (item.status === 'needs_human') needsHuman += 1
      else if (item.status === 'blocked') blocked += 1
      else if (['generating', 'verifying', 'fixing'].includes(item.status)) inFlight += 1
    }

    return {
      projectId,
      running: Boolean(run?.running) && this.active.has(projectId),
      currentStage,
      stages: this.buildStages(currentStage, project?.status === 'delivered'),
      concurrency,
      maxFixRounds,
      regressionChecklist: regression.map((row) => toRegressionItem(row as unknown as Row)),
      summary: `共 ${items.length} 条：通过 ${passed}，失败 ${failed}，待人工 ${needsHuman}，阻塞 ${blocked}，进行中 ${inFlight}`,
    }
  }

  private buildStages(current: StageKey, delivered: boolean): StageInfo[] {
    const order = PIPELINE_STAGES.map((stage) => stage.key)
    const currentIndex = order.indexOf(current)
    return PIPELINE_STAGES.map((stage, index) => {
      let state: StageInfo['state']
      if (delivered) state = 'done'
      else if (index < currentIndex) state = 'done'
      else if (index === currentIndex) state = 'active'
      else state = 'todo'
      return { key: stage.key, label: stage.label, state }
    })
  }

  private async updateItem(itemId: string, data: Record<string, unknown>): Promise<RequirementItem> {
    const row = await this.prisma.requirementItem.update({
      where: { id: itemId },
      data: data as Prisma.RequirementItemUncheckedUpdateInput,
    })
    const item = toRequirementItem(row as unknown as Row)
    this.gateway.emitItemStatus(item)
    return item
  }

  private async persistVerifications(
    itemId: string,
    round: number,
    results: SandboxCheckResult[],
  ): Promise<void> {
    if (results.length === 0) return
    await this.prisma.verificationRun.createMany({
      data: results.map((result) => ({
        itemId,
        round,
        checkType: result.checkType,
        passed: result.passed,
        errorLog: result.errorLog,
        durationMs: result.durationMs,
      })),
    })
  }

  private async persistFix(
    itemId: string,
    round: number,
    errorSnapshot: ErrorSnapshot,
    patch: string,
    result: FixRecord['result'],
  ): Promise<void> {
    await this.prisma.fixRecord.create({
      data: { itemId, round, errorSnapshot: errorSnapshot as unknown as object, patch, result },
    })
  }

  private async markNeedsHuman(
    itemId: string,
    round: number,
    blocking: SandboxCheckResult,
  ): Promise<void> {
    const snapshot = this.snapshot(blocking.checkType, round + 1, blocking.errorLog ?? '')
    // 到顶了是「修复轮次耗尽」而非普通检查失败，明确告知人工介入原因
    snapshot.message = ERROR_MESSAGES[ErrorCode.FIX_LIMIT_REACHED]
    const lastFix = await this.prisma.fixRecord.findFirst({
      where: { itemId },
      orderBy: { createdAt: 'desc' },
    })
    if (lastFix) {
      await this.prisma.fixRecord.update({
        where: { id: lastFix.id },
        data: { result: 'needs_human' },
      })
    }
    await this.updateItem(itemId, {
      status: 'needs_human',
      retryCount: round,
      errorSnapshot: snapshot as unknown as object,
    })
  }

  /** 生成人工回归清单：以条目验收标准为检查项（PRD 3.4 VER-08） */
  private async buildRegression(projectId: string): Promise<void> {
    const items = await this.prisma.requirementItem.findMany({
      where: { projectId, status: { in: ['passed', 'failed', 'needs_human'] } },
      orderBy: { code: 'asc' },
    })
    // 重建而非跳过：新增/变更条目需同步进回归清单（B-3）；同内容的已勾选状态予以保留
    const existing = await this.prisma.regressionItem.findMany({ where: { projectId } })
    const checkedMap = new Map(existing.map((row) => [`${row.itemId}|${row.text}`, row.checked]))

    const data: { projectId: string; itemId: string; text: string; checked: boolean }[] = []
    for (const item of items) {
      const acceptance = (item.acceptance as string[] | null) ?? []
      const checks = acceptance.length > 0 ? acceptance : [`${item.title} 功能正常`]
      for (const text of checks) {
        data.push({ projectId, itemId: item.id, text, checked: checkedMap.get(`${item.id}|${text}`) ?? false })
      }
    }

    // 删除与重建必须原子完成，否则中途失败会留下空回归清单（M5）
    await this.prisma.$transaction(async (tx) => {
      await tx.regressionItem.deleteMany({ where: { projectId } })
      if (data.length > 0) await tx.regressionItem.createMany({ data })
    })
  }

  private mergeFiles(base: GeneratedFile[], patch: GeneratedFile[]): GeneratedFile[] {
    const map = new Map(base.map((file) => [file.path, file]))
    for (const file of patch) map.set(file.path, file)
    return [...map.values()]
  }

  private snapshot(checkType: VerificationCheckType, round: number, output: string): ErrorSnapshot {
    return {
      message: `${VERIFICATION_CHECK_META[checkType].label}未通过（第 ${round} 轮）`,
      checkType,
      round,
      output: output.slice(0, 4000),
      at: new Date().toISOString(),
    }
  }

  private singleBatch(
    itemRows: { id: string; code: string; title: string; layer: string }[],
  ): ExecutionBatch {
    return {
      batch: 1,
      parallel: itemRows.length,
      nodes: itemRows.map((row) => ({
        id: row.id,
        code: row.code,
        title: row.title,
        layer: row.layer as RequirementItem['layer'],
      })),
    }
  }

  private async emitStatus(projectId: string): Promise<void> {
    const status = await this.buildStatus(projectId)
    this.gateway.emitPipelineStatus(status)
  }
}
