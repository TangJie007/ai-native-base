import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  MODEL_TIER_META,
  type ModelSettings,
  type ModelTier,
  type ModelTierBinding,
  type UpdateModelSettingsDto,
} from '@specforge/shared'
import { decryptSecret, encryptSecret } from '../../common/crypto.util'
import { toTierBindings } from '../../common/mappers'
import type { AppConfiguration } from '../../config/configuration'
import { LlmService } from '../../infra/llm/llm.service'
import { PrismaService } from '../../prisma/prisma.service'

const DEV_SECRET = 'specforge-dev-secret-change-me'

/**
 * 模型配置（PRD 10）：用户级保存 provider / baseUrl / 各档位模型，
 * 密钥加密落库、永不下发前端；保存后热切换到 LlmService，无需重启。
 */
@Injectable()
export class SettingsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SettingsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly llm: LlmService,
  ) {}

  /** 启动时恢复最近一次保存的模型配置 */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const row = await this.prisma.modelSettings.findFirst({ orderBy: { updatedAt: 'desc' } })
      if (!row) return
      const apiKey = row.apiKeyCipher ? (decryptSecret(row.apiKeyCipher, this.jwtSecret()) ?? '') : ''
      this.llm.applySettings({
        provider: row.provider,
        baseUrl: row.baseUrl,
        apiKey,
        fallbackModel: row.fallbackModel,
        tiers: this.normalizeTiers(row.tiers),
      })
    } catch (error) {
      this.logger.warn(`恢复模型配置失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async get(userId: string): Promise<ModelSettings> {
    const row = await this.prisma.modelSettings.findUnique({ where: { userId } })
    const cfg = this.config.get<AppConfiguration['llm']>('llm')
    if (!row) {
      return {
        provider: this.llm.currentProviderName(),
        baseUrl: cfg?.baseUrl ?? '',
        apiKey: null,
        apiKeyConfigured: this.llm.isApiKeyConfigured(),
        tiers: this.llm.currentTiers(),
        fallbackModel: cfg?.fallbackModel ?? '',
      }
    }
    return {
      provider: row.provider,
      baseUrl: row.baseUrl,
      apiKey: null,
      apiKeyConfigured: Boolean(row.apiKeyCipher),
      tiers: this.currentTiers(row.tiers),
      fallbackModel: row.fallbackModel,
    }
  }

  async update(userId: string, dto: UpdateModelSettingsDto): Promise<ModelSettings> {
    const current = await this.prisma.modelSettings.findUnique({ where: { userId } })
    const secret = this.jwtSecret()

    const provider = dto.provider ?? current?.provider ?? this.llm.currentProviderName()
    const baseUrl = dto.baseUrl ?? current?.baseUrl ?? ''
    const fallbackModel = dto.fallbackModel ?? current?.fallbackModel ?? ''

    const baseTiers = this.currentTiers(current?.tiers ?? null)
    const tiers = dto.tiers ? this.mergeTiers(baseTiers, dto.tiers) : baseTiers

    let apiKeyCipher = current?.apiKeyCipher ?? null
    if (dto.apiKey === null) apiKeyCipher = null
    else if (typeof dto.apiKey === 'string' && dto.apiKey.trim() !== '') {
      apiKeyCipher = encryptSecret(dto.apiKey.trim(), secret)
    }

    await this.prisma.modelSettings.upsert({
      where: { userId },
      create: {
        userId,
        provider,
        baseUrl,
        apiKeyCipher,
        fallbackModel,
        tiers: tiers as unknown as object,
      },
      update: {
        provider,
        baseUrl,
        apiKeyCipher,
        fallbackModel,
        tiers: tiers as unknown as object,
      },
    })

    const apiKey = apiKeyCipher ? (decryptSecret(apiKeyCipher, secret) ?? '') : ''
    this.llm.applySettings({
      provider,
      baseUrl,
      apiKey,
      fallbackModel,
      tiers: tiers.map((item) => ({ tier: item.tier, model: item.model })),
    })
    return this.get(userId)
  }

  /** 设置页「测试连接」：直接用当前适配器做一次轻量调用 */
  async test(_userId: string, model: string, prompt: string): Promise<{ ok: boolean; message: string }> {
    return this.llm.testModel(model, prompt)
  }

  private mergeTiers(
    base: ModelTierBinding[],
    overrides: { tier: ModelTier; model: string }[],
  ): ModelTierBinding[] {
    const result = base.map((binding) => ({ ...binding, stages: [...binding.stages] }))
    for (const override of overrides) {
      const found = result.find((binding) => binding.tier === override.tier)
      if (found) found.model = override.model
      else
        result.push({
          tier: override.tier,
          model: override.model,
          stages: [...MODEL_TIER_META[override.tier].stages],
        })
    }
    return result
  }

  /** 以当前运行时档位为骨架，覆盖库中保存的模型名，保证 stages 元数据最新 */
  private currentTiers(value: unknown): ModelTierBinding[] {
    const skeleton = this.llm.currentTiers()
    const stored = toTierBindings(value)
    return skeleton.map((binding) => {
      const found = stored.find((item) => item.tier === binding.tier)
      return found?.model ? { ...binding, model: found.model } : binding
    })
  }

  private normalizeTiers(value: unknown): { tier: ModelTier; model: string }[] {
    return toTierBindings(value).map((item) => ({ tier: item.tier, model: item.model }))
  }

  private jwtSecret(): string {
    return this.config.get<string>('jwt.secret') ?? DEV_SECRET
  }
}
