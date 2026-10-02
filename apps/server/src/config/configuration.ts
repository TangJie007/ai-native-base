import { DEFAULT_CONCURRENCY, DEFAULT_MAX_FIX_ROUNDS, type ModelTier } from '@specforge/shared'

/** 集中读取环境变量，带默认值，避免各处散落 process.env */
export interface AppConfiguration {
  port: number
  jwt: { secret: string; expiresIn: string }
  vectorDbPath: string
  sandboxProvider: 'mock' | 'e2b' | 'docker'
  pipelineConcurrency: number
  maxFixRounds: number
  llm: {
    provider: string
    baseUrl: string
    apiKey: string
    models: Record<ModelTier, string>
    fallbackModel: string
  }
}

export default (): AppConfiguration => ({
  port: Number(process.env.PORT ?? 3000),
  jwt: {
    secret: process.env.JWT_SECRET ?? 'specforge-dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  vectorDbPath: process.env.VECTOR_DB_PATH ?? './data/vectors.db',
  sandboxProvider: (process.env.SANDBOX_PROVIDER as AppConfiguration['sandboxProvider']) ?? 'mock',
  pipelineConcurrency: Number(process.env.PIPELINE_CONCURRENCY ?? DEFAULT_CONCURRENCY),
  maxFixRounds: Number(process.env.MAX_FIX_ROUNDS ?? DEFAULT_MAX_FIX_ROUNDS),
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
