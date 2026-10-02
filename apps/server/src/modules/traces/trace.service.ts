import { Injectable, Logger } from '@nestjs/common'
import type { AgentName, AgentTrace, TraceStatus } from '@specforge/shared'
import type { LlmUsage } from '../../infra/llm/llm.types'
import { toAgentTrace, type Row } from '../../common/mappers'
import { PrismaService } from '../../prisma/prisma.service'
import { PipelineGateway } from '../realtime/pipeline.gateway'

export interface TraceRecordInput {
  projectId: string
  itemId?: string | null
  agent: AgentName
  model: string
  action: string
  inputSummary?: string
  outputSummary?: string
  usage?: LlmUsage
  durationMs: number
  status: TraceStatus
}

/** 单次 Agent 调用的可追踪返回值，结构上与 LlmService 的 LlmCallResult 对齐 */
export interface TrackedCall<T> {
  result: T
  usage: LlmUsage
  agent: AgentName
}

/**
 * Agent 轨迹记录（PRD 9 agent_traces / 4.5 全链路可观测）。
 * 每次模型调用落一条记录并实时推送，前端轨迹页与流水线页共用。
 */
@Injectable()
export class TraceService {
  private readonly logger = new Logger(TraceService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PipelineGateway,
  ) {}

  async record(input: TraceRecordInput): Promise<AgentTrace> {
    const row = await this.prisma.agentTrace.create({
      data: {
        projectId: input.projectId,
        itemId: input.itemId ?? null,
        agentName: input.agent,
        model: input.model,
        action: input.action,
        inputTokens: input.usage?.inputTokens ?? 0,
        outputTokens: input.usage?.outputTokens ?? 0,
        durationMs: input.durationMs,
        inputSummary: input.inputSummary ?? '',
        outputSummary: input.outputSummary ?? '',
        status: input.status,
      },
    })
    const trace = toAgentTrace(row as unknown as Row)
    this.gateway.emitTrace(trace)
    return trace
  }

  /** 包裹一次模型调用：自动计时、记录成功/失败并推送 */
  async track<T>(
    meta: {
      projectId: string
      itemId?: string | null
      action: string
      inputSummary?: string
      /** 预期 Agent 角色，仅用于失败兜底记录，避免失败全被记为 parser（B-8） */
      agent?: AgentName
    },
    call: () => Promise<TrackedCall<T>>,
  ): Promise<T> {
    const startedAt = Date.now()
    try {
      const { result, usage, agent } = await call()
      await this.safeRecord({
        projectId: meta.projectId,
        itemId: meta.itemId,
        agent,
        model: usage.model,
        action: meta.action,
        inputSummary: meta.inputSummary,
        outputSummary: this.summarize(result),
        usage,
        durationMs: Date.now() - startedAt,
        status: 'success',
      })
      return result
    } catch (error) {
      // 记录失败不能覆盖原始业务错误
      await this.safeRecord({
        projectId: meta.projectId,
        itemId: meta.itemId,
        agent: meta.agent ?? 'parser',
        model: 'unknown',
        action: meta.action,
        inputSummary: meta.inputSummary,
        outputSummary: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
        status: 'failed',
      })
      throw error
    }
  }

  /** 轨迹记录属于旁路可观测能力，失败只记日志，不影响主流程与原始错误 */
  private async safeRecord(input: TraceRecordInput): Promise<void> {
    try {
      await this.record(input)
    } catch (error) {
      this.logger.warn(
        `轨迹记录失败（不影响主流程）：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private summarize(value: unknown): string {
    try {
      const text = typeof value === 'string' ? value : JSON.stringify(value)
      return text.slice(0, 500)
    } catch {
      return ''
    }
  }
}
