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

/**
 * 模型调用门面：负责按 Agent 角色选择档位与模型、按配置切换适配器，并统一记录用量。
 * 业务模块只依赖本服务，不感知具体 provider。
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name)
  private provider: LlmProvider
  private providerKey = ''
  private tiers: ModelTierBinding[]
  private providerName: string
  private baseUrl: string
  private apiKey: string
  private fallbackModel: string

  constructor(private readonly config: ConfigService) {
    const llm = this.config.get<AppConfiguration['llm']>('llm')
    this.providerName = llm?.provider ?? 'mock'
    this.baseUrl = llm?.baseUrl ?? ''
    this.apiKey = llm?.apiKey ?? ''
    this.fallbackModel = llm?.fallbackModel ?? ''
    this.tiers = this.defaultTiers(llm?.models)
    this.provider = this.buildProvider()
  }

  /** 设置页保存后热切换，无需重启服务 */
  applySettings(input: {
    provider: string
    baseUrl: string
    apiKey: string
    fallbackModel: string
    tiers: { tier: ModelTier; model: string }[]
  }): void {
    this.providerName = input.provider
    this.baseUrl = input.baseUrl
    this.apiKey = input.apiKey
    this.fallbackModel = input.fallbackModel
    for (const binding of input.tiers) {
      const target = this.tiers.find((t) => t.tier === binding.tier)
      if (target) target.model = binding.model
    }
    this.provider = this.buildProvider()
    this.logger.log(`模型适配器已切换为 ${this.provider.name}`)
  }

  currentProviderName(): string {
    return this.provider.name
  }

  isApiKeyConfigured(): boolean {
    return Boolean(this.apiKey)
  }

  currentTiers(): ModelTierBinding[] {
    return this.tiers.map((t) => ({ ...t, stages: [...t.stages] }))
  }

  modelFor(agent: AgentName): string {
    const tier = AGENT_META[agent].tier
    const binding = this.tiers.find((t) => t.tier === tier)
    return binding?.model || this.fallbackModel || 'mock-model'
  }

  /** 供设置页「测试连接」使用 */
  async testModel(model: string, prompt: string): Promise<{ ok: boolean; message: string }> {
    try {
      const provider = this.buildProvider()
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
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  /* ------------------------- 语义化调用 ------------------------- */

  async parseRequirement(input: {
    content: string
    fileName: string
    projectName: string
    stackConfig: StackConfig
  }): Promise<LlmCallResult<ParsedRequirementResult>> {
    return this.invoke('parser', (provider, model) =>
      provider.parseRequirement({ model, ...input }),
    )
  }

  async generateContract(input: {
    spec: ParsedSpec
    items: RequirementItem[]
    stackConfig: StackConfig
  }): Promise<LlmCallResult<GeneratedContract>> {
    return this.invoke('contract', (provider, model) => provider.generateContract({ model, ...input }))
  }

  async analyzeDependencies(input: {
    items: RequirementItem[]
    contract: Contract | null
  }): Promise<LlmCallResult<GeneratedDependency[]>> {
    return this.invoke('architect', (provider, model) => provider.analyzeDependencies({ model, ...input }))
  }

  async generateItemCode(input: {
    item: RequirementItem
    contract: Contract | null
    stackConfig: StackConfig
  }): Promise<LlmCallResult<GeneratedFile[]>> {
    const agent: AgentName = input.item.layer === 'frontend' ? 'frontend' : 'backend'
    return this.invoke(agent, (provider, model) => provider.generateItemCode({ model, ...input }))
  }

  async fixError(input: {
    item: RequirementItem
    error: ErrorSnapshot
    files: GeneratedFile[]
    round: number
  }): Promise<LlmCallResult<GeneratedFix>> {
    return this.invoke('fixer', (provider, model) => provider.fixError({ model, ...input }))
  }

  /* ------------------------- 内部 ------------------------- */

  private async invoke<T>(
    agent: AgentName,
    call: (provider: LlmProvider, model: string) => Promise<{ result: T; usage: LlmUsage }>,
  ): Promise<LlmCallResult<T>> {
    const model = this.modelFor(agent)
    const invoked = await call(this.provider, model)
    return { result: invoked.result, usage: invoked.usage, agent }
  }

  private buildProvider(): LlmProvider {
    const key = `${this.providerName}|${this.baseUrl}|${this.apiKey}`
    if (this.providerKey === key && this.provider) return this.provider
    this.providerKey = key
    if (this.providerName === 'openai' && this.baseUrl && this.apiKey) {
      return new OpenAiCompatibleProvider(this.baseUrl, this.apiKey)
    }
    if (this.providerName !== 'mock') {
      this.logger.warn(`适配器 ${this.providerName} 缺少 baseUrl/apiKey，回退到 Mock 适配器。`)
    }
    return new MockLlmProvider()
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
