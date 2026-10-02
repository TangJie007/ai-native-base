import { DEFAULT_CONCURRENCY, DEFAULT_MAX_FIX_ROUNDS, type ModelTier } from '@specforge/shared'

/** 开发环境默认 JWT 密钥（仅用于本地，生产环境必须覆盖） */
export const DEV_JWT_SECRET = 'specforge-dev-secret-change-me'

/** 集中读取环境变量，带默认值，避免各处散落 process.env */
export interface AppConfiguration {
  port: number
  jwt: { secret: string; expiresIn: string }
  corsOrigins: string[]
  vectorDbPath: string
  sandboxProvider: 'mock' | 'e2b' | 'docker'
  pipelineConcurrency: number
  maxFixRounds: number
  llmTimeoutMs: number
  llmMaxRetries: number
  llm: {
    provider: string
    baseUrl: string
    apiKey: string
    models: Record<ModelTier, string>
    fallbackModel: string
  }
}

const DEFAULT_CORS_ORIGINS = ['http://localhost:5173', 'http://localhost:5174']

/** 生产环境强制校验 JWT 密钥强度，避免带着默认值上线 */
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret === DEV_JWT_SECRET || secret.length < 32) {
      throw new Error(
        '生产环境必须通过 JWT_SECRET 配置长度不小于 32 的随机密钥（禁止使用开发默认值）',
      )
    }
    return secret
  }
  return secret ?? DEV_JWT_SECRET
}

export default (): AppConfiguration => ({
  port: Number(process.env.PORT ?? 3000),
  jwt: {
    secret: resolveJwtSecret(),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  corsOrigins: (process.env.CORS_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)) ?? DEFAULT_CORS_ORIGINS,
  vectorDbPath: process.env.VECTOR_DB_PATH ?? './data/vectors.db',
  sandboxProvider: (process.env.SANDBOX_PROVIDER as AppConfiguration['sandboxProvider']) ?? 'mock',
  pipelineConcurrency: Number(process.env.PIPELINE_CONCURRENCY ?? DEFAULT_CONCURRENCY),
  maxFixRounds: Number(process.env.MAX_FIX_ROUNDS ?? DEFAULT_MAX_FIX_ROUNDS),
  llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 60000),
  llmMaxRetries: Number(process.env.LLM_MAX_RETRIES ?? 1),
  llm: {
    provider: process.env.LLM_PROVIDER ?? 'mock',
    baseUrl: process.env.LLM_BASE_URL ?? '',
    apiKey: process.env.LLM_API_KEY ?? '',
    models: {
      high: process.env.LLM_MODEL_HIGH ?? 'gpt-4o',
      value: process.env.LLM_MODEL_VALUE ?? 'gpt-4o-mini',
      medium: process.env.LLM_MODEL_MEDIUM ?? 'gpt-4o-mini',
    },
    fallbackModel: process.env.LLM_FALLBACK_MODEL ?? '',
  },
})
