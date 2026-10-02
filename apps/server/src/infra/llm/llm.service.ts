import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  AGENT_META,
  type AgentName,
  type Contract,
  type ErrorSnapshot,
  type ModelTier,
  type ModelTierBinding,
  type ParsedSpec,
  type RequirementItem,
  type StackConfig,
} from '@specforge/shared'
import type { AppConfiguration } from '../../config/configuration'
import { MockLlmProvider } from './mock-llm.provider'
import { OpenAiCompatibleProvider } from './openai-compatible.provider'
import type {
  FixAttempt,
  GeneratedContract,
  GeneratedDependency,
  GeneratedFile,
  GeneratedFix,
  LlmProvider,
  LlmUsage,
  ParsedRequirementResult,
} from './llm.types'

export interface LlmCallResult<T> {
  result: T
  usage: LlmUsage
  agent: AgentName
}

/** 单个用户生效的模型配置（含已构建的适配器实例） */
interface UserLlmConfig {
  providerName: string
  baseUrl: string
  apiKey: string
  fallbackModel: string
  tiers: ModelTierBinding[]
  providerKey: string
  provider?: LlmProvider
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * 模型调用门面：负责按 Agent 角色选择档位与模型、按配置切换适配器，并统一记录用量。
 * 业务模块只依赖本服务，不感知具体 provider。
 *
 * 配置按用户隔离：每个用户有独立的 provider / 密钥 / 档位配置（overrides），
 * 未配置的用户回落到 .env 的默认配置（defaults），杜绝「一个用户改配置，全体串号」。
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name)
  private readonly defaults: UserLlmConfig
  private readonly overrides = new Map<string, UserLlmConfig>()
  private readonly timeoutMs: number

  constructor(private readonly config: ConfigService) {
    this.timeoutMs = this.config.get<number>('llmTimeoutMs') ?? 60000
    const llm = this.config.get<AppConfiguration['llm']>('llm')
    const cfg: UserLlmConfig = {
      providerName: llm?.provider ?? 'mock',
      baseUrl: llm?.baseUrl ?? '',
      apiKey: llm?.apiKey ?? '',
      fallbackModel: llm?.fallbackModel ?? '',
      tiers: this.defaultTiers(llm?.models),
      providerKey: '',
    }
    cfg.provider = this.resolveProvider(cfg)
    this.defaults = cfg
  }

  /** 设置页保存后按用户热切换，无需重启服务 */
  applySettings(
    userId: string,
    input: {
      provider: string
      baseUrl: string
      apiKey: string
      fallbackModel: string
      tiers: { tier: ModelTier; model: string }[]
    },
  ): void {
    const existing = this.overrides.get(userId)
    const tiers = this.cloneTiers(existing?.tiers ?? this.defaults.tiers)
    for (const binding of input.tiers) {
      const target = tiers.find((t) => t.tier === binding.tier)
      if (target) target.model = binding.model
    }
    const cfg: UserLlmConfig = {
      providerName: input.provider,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      fallbackModel: input.fallbackModel,
      tiers,
      providerKey: '',
    }
    cfg.provider = this.resolveProvider(cfg)
    this.overrides.set(userId, cfg)
    this.logger.log(`用户 ${userId} 模型适配器已切换为 ${cfg.provider.name}`)
  }

  /** 用户生效的适配器名（未配置则为默认适配器） */
  currentProviderName(userId?: string): string {
    return this.resolveProvider(this.configFor(userId)).name
  }

  isApiKeyConfigured(userId?: string): boolean {
    return Boolean(this.configFor(userId).apiKey)
  }

  /** 用户生效的档位绑定（stages 元数据始终取最新骨架） */
  currentTiers(userId?: string): ModelTierBinding[] {
    return this.cloneTiers(this.configFor(userId).tiers)
  }

  /** 供设置页「测试连接」使用 */
  async testModel(
    userId: string,
    model: string,
    prompt: string,
  ): Promise<{ ok: boolean; message: string }> {
    try {
      const provider = this.resolveProvider(this.configFor(userId))
      if (provider.name === 'mock') {
        return { ok: true, message: '当前为 Mock 适配器，返回固定响应，未真实调用外部模型。' }
      }
      const { usage } = await provider.parseRequirement({
        model,
        content: `# 测试\n${prompt}`,
        fileName: 'test.md',
        projectName: '连接测试',
        stackConfig: {} as StackConfig,
      })
      return { ok: true, message: `连接成功，模型 ${usage.model} 可用。` }
    } catch (error) {
      return { ok: false, message: messageOf(error) }
    }
  }

  /* ------------------------- 语义化调用 ------------------------- */

  async parseRequirement(
    userId: string,
    input: {
      content: string
      fileName: string
      projectName: string
      stackConfig: StackConfig
    },
  ): Promise<LlmCallResult<ParsedRequirementResult>> {
    return this.invoke(userId, 'parser', (provider, model) =>
      provider.parseRequirement({ model, ...input }),
    )
  }

  async generateContract(
    userId: string,
    input: {
      spec: ParsedSpec
      items: RequirementItem[]
      stackConfig: StackConfig
    },
  ): Promise<LlmCallResult<GeneratedContract>> {
    return this.invoke(userId, 'contract', (provider, model) =>
      provider.generateContract({ model, ...input }),
    )
  }

  async analyzeDependencies(
    userId: string,
    input: {
      items: RequirementItem[]
      contract: Contract | null
    },
  ): Promise<LlmCallResult<GeneratedDependency[]>> {
    return this.invoke(userId, 'architect', (provider, model) =>
      provider.analyzeDependencies({ model, ...input }),
    )
  }

  async generateItemCode(
    userId: string,
    input: {
      item: RequirementItem
      contract: Contract | null
      stackConfig: StackConfig
    },
  ): Promise<LlmCallResult<GeneratedFile[]>> {
    const agent: AgentName = input.item.layer === 'frontend' ? 'frontend' : 'backend'
    return this.invoke(userId, agent, (provider, model) =>
      provider.generateItemCode({ model, ...input }),
    )
  }

  async fixError(
    userId: string,
    input: {
      item: RequirementItem
      error: ErrorSnapshot
      files: GeneratedFile[]
      round: number
      history: FixAttempt[]
    },
  ): Promise<LlmCallResult<GeneratedFix>> {
    return this.invoke(userId, 'fixer', (provider, model) => provider.fixError({ model, ...input }))
  }

  /* ------------------------- 内部 ------------------------- */

  private async invoke<T>(
    userId: string,
    agent: AgentName,
    call: (provider: LlmProvider, model: string) => Promise<{ result: T; usage: LlmUsage }>,
  ): Promise<LlmCallResult<T>> {
    const cfg = this.configFor(userId)
    const provider = this.resolveProvider(cfg)
    const model = this.modelFor(agent, cfg)

    const timeoutMs = this.config.get<number>('llmTimeoutMs') ?? 60000
    const maxRetries = this.config.get<number>('llmMaxRetries') ?? 1

    let lastError: unknown
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const invoked = await this.withTimeout(call(provider, model), timeoutMs)
        return { result: invoked.result, usage: invoked.usage, agent }
      } catch (error) {
        lastError = error
        this.logger.warn(
          `模型调用失败（${agent} 第 ${attempt + 1}/${maxRetries + 1} 次）：${messageOf(error)}`,
        )
      }
    }

    // 主模型重试耗尽后，降级到 fallbackModel 再试一次
    if (cfg.fallbackModel && cfg.fallbackModel !== model) {
      this.logger.warn(`降级到备用模型 ${cfg.fallbackModel}（${agent}）`)
      try {
        const invoked = await this.withTimeout(call(provider, cfg.fallbackModel), timeoutMs)
        return { result: invoked.result, usage: invoked.usage, agent }
      } catch (error) {
        lastError = error
      }
    }

    throw lastError instanceof Error ? lastError : new Error(messageOf(lastError))
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    if (!ms || ms <= 0) return promise
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`模型调用超时（${ms}ms）`)), ms)
    })
    try {
      return await Promise.race([promise, timeout])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private configFor(userId?: string): UserLlmConfig {
    if (userId) {
      const override = this.overrides.get(userId)
      if (override) return override
    }
    return this.defaults
  }

  private modelFor(agent: AgentName, cfg: UserLlmConfig): string {
    const tier = AGENT_META[agent].tier
    const binding = cfg.tiers.find((t) => t.tier === tier)
    return binding?.model || cfg.fallbackModel || 'mock-model'
  }

  /** 按配置构建/复用适配器实例 */
  private resolveProvider(cfg: UserLlmConfig): LlmProvider {
    const key = `${cfg.providerName}|${cfg.baseUrl}|${cfg.apiKey}`
    if (cfg.provider && cfg.providerKey === key) return cfg.provider
    cfg.providerKey = key
    // 兼容 openai-compatible / openai_compatible / compatible 等历史写法
    const normalized = ['openai-compatible', 'openai_compatible', 'compatible'].includes(cfg.providerName)
      ? 'openai'
      : cfg.providerName
    if (normalized === 'openai' && cfg.baseUrl && cfg.apiKey) {
      cfg.provider = new OpenAiCompatibleProvider(cfg.baseUrl, cfg.apiKey, this.timeoutMs)
    } else {
      if (normalized !== 'mock') {
        this.logger.warn(`适配器 ${cfg.providerName} 缺少 baseUrl/apiKey，回退到 Mock 适配器。`)
      }
      cfg.provider = new MockLlmProvider()
    }
    return cfg.provider
  }

  private cloneTiers(tiers: ModelTierBinding[]): ModelTierBinding[] {
    return tiers.map((t) => ({ ...t, stages: [...t.stages] }))
  }

  private defaultTiers(models?: Record<ModelTier, string>): ModelTierBinding[] {
    const resolve = (tier: ModelTier) => models?.[tier] ?? 'mock-model'
    return [
      { tier: 'high', model: resolve('high'), stages: ['S1 需求解析', 'S2 契约生成', 'S3 依赖分析'] },
      { tier: 'value', model: resolve('value'), stages: ['S4 代码生成', 'S4 测试生成', '脚手架'] },
      { tier: 'medium', model: resolve('medium'), stages: ['S5 错误修复'] },
    ]
  }
}
