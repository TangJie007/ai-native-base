import type {
  AgentName,
  AssumptionCategory,
  AssumptionStatus,
  DependencyType,
  GateKey,
  ItemLayer,
  ItemStatus,
  ModelTier,
  ProjectStatus,
  StackConfig,
  StageKey,
  VerificationCheckType,
} from './types'

/* ------------------------------------------------------------------ */
/* 展示元数据（前端标签 + 颜色，后端推送也用同一份，避免两边写两套）      */
/* ------------------------------------------------------------------ */

export interface StatusMeta {
  label: string
  /** Element Plus tag 的 type */
  type: 'primary' | 'success' | 'warning' | 'danger' | 'info'
}

export const ITEM_STATUS_META: Record<ItemStatus, StatusMeta> = {
  pending: { label: '排队中', type: 'info' },
  blocked: { label: '依赖等待', type: 'info' },
  generating: { label: '生成中', type: 'primary' },
  verifying: { label: '验证中', type: 'primary' },
  fixing: { label: '修复中', type: 'warning' },
  passed: { label: '已通过', type: 'success' },
  failed: { label: '失败', type: 'danger' },
  needs_human: { label: '待人工', type: 'danger' },
}

export const ITEM_LAYER_META: Record<ItemLayer, StatusMeta> = {
  fullstack: { label: '全栈', type: 'primary' },
  backend: { label: '后端', type: 'success' },
  frontend: { label: '前端', type: 'warning' },
  data: { label: '数据', type: 'info' },
}

export const ASSUMPTION_CATEGORY_META: Record<AssumptionCategory, StatusMeta> = {
  business_rule: { label: '业务规则', type: 'primary' },
  data_field: { label: '数据字段', type: 'success' },
  permission: { label: '权限', type: 'warning' },
  interaction: { label: '交互行为', type: 'info' },
  exception: { label: '异常场景', type: 'danger' },
}

export const ASSUMPTION_STATUS_META: Record<AssumptionStatus, StatusMeta> = {
  pending: { label: '待确认', type: 'warning' },
  confirmed: { label: '已确认', type: 'success' },
  default: { label: '沿用默认', type: 'info' },
}

export const DEPENDENCY_TYPE_META: Record<DependencyType, { label: string; serial: boolean }> = {
  data: { label: '数据依赖', serial: true },
  api: { label: '接口依赖', serial: true },
  page: { label: '页面依赖', serial: false },
  none: { label: '无依赖', serial: false },
}

export const PROJECT_STATUS_META: Record<ProjectStatus, StatusMeta> = {
  draft: { label: '草稿', type: 'info' },
  parsing: { label: '解析中', type: 'primary' },
  awaiting_assumptions: { label: '待确认假设', type: 'warning' },
  awaiting_contract: { label: '待确认契约', type: 'warning' },
  awaiting_dependencies: { label: '待确认依赖', type: 'warning' },
  generating: { label: '生成中', type: 'primary' },
  verifying: { label: '验证中', type: 'primary' },
  awaiting_regression: { label: '待人工回归', type: 'warning' },
  delivered: { label: '已交付', type: 'success' },
  paused: { label: '已暂停', type: 'info' },
  failed: { label: '失败', type: 'danger' },
}

export const AGENT_META: Record<AgentName, { label: string; tier: ModelTier; duties: string }> = {
  parser: { label: 'Parser Agent', tier: 'high', duties: '需求解析与假设生成' },
  contract: { label: 'Contract Agent', tier: 'high', duties: '契约生成（单一实例）' },
  architect: { label: 'Architect Agent', tier: 'high', duties: '技术栈推荐 + 依赖分析' },
  scaffold: { label: 'Scaffold Agent', tier: 'value', duties: '脚手架生成' },
  frontend: { label: 'Frontend Agent', tier: 'value', duties: '前端代码生成' },
  backend: { label: 'Backend Agent', tier: 'value', duties: '后端代码生成' },
  test: { label: 'Test Agent', tier: 'value', duties: '测试生成' },
  fixer: { label: 'Fixer Agent', tier: 'medium', duties: '错误修复' },
  reviewer: { label: 'Reviewer Agent', tier: 'high', duties: '契约一致性校验' },
}

export const VERIFICATION_CHECK_META: Record<VerificationCheckType, { label: string; order: number; blocking: boolean }> = {
  install: { label: '依赖安装', order: 1, blocking: true },
  typecheck: { label: '类型检查', order: 2, blocking: true },
  lint: { label: 'Lint 检查', order: 3, blocking: true },
  build: { label: '构建', order: 4, blocking: true },
  unit_test: { label: '单元测试', order: 5, blocking: true },
  smoke_test: { label: '冒烟测试', order: 6, blocking: true },
  e2e_test: { label: 'E2E 测试', order: 7, blocking: false },
  security_scan: { label: '安全扫描', order: 8, blocking: true },
}

/** 五阶段定义，见 PRD 4.1。gate 用机器可判定的 GateKey，展示标签见 GATE_META */
export const PIPELINE_STAGES: { key: StageKey; label: string; gate: GateKey | null }[] = [
  { key: 'S1', label: '需求解析', gate: 'assumptions' },
  { key: 'S2', label: '契约生成', gate: 'contract' },
  { key: 'S3', label: '计划编排', gate: 'dependencies' },
  { key: 'S4', label: '代码生成', gate: null },
  { key: 'S5', label: '验证交付', gate: 'regression' },
]

/** 四个卡点的展示元数据（三个强阻断 + 人工回归），与 GateKey 一一对应 */
export const GATE_META: Record<GateKey, StatusMeta> = {
  assumptions: { label: '假设确认', type: 'warning' },
  contract: { label: '契约确认', type: 'warning' },
  dependencies: { label: '依赖确认', type: 'warning' },
  regression: { label: '人工回归', type: 'warning' },
}

export const MODEL_TIER_META: Record<ModelTier, { label: string; stages: string[] }> = {
  high: { label: '高能力模型', stages: ['S1 需求解析', 'S2 契约生成', 'S3 依赖分析'] },
  value: { label: '性价比模型', stages: ['S4 代码生成', 'S4 测试生成', '脚手架'] },
  medium: { label: '中等模型', stages: ['S5 错误修复'] },
}

/* ------------------------------------------------------------------ */
/* 默认配置                                                            */
/* ------------------------------------------------------------------ */

export const LOCKED_STACK: Omit<StackConfig, 'uiLibrary' | 'requestLayer' | 'authStrategy' | 'aiRationale'> = {
  frontend: 'Vue 3 + TypeScript + Vite',
  state: 'Pinia',
  backend: 'NestJS + TypeScript',
  database: 'MySQL',
  orm: 'Prisma',
  router: 'Vue Router',
  testFramework: 'Vitest + Supertest + Playwright',
  packageManager: 'pnpm',
  monorepo: 'pnpm workspace',
}

export const DEFAULT_STACK_CONFIG: StackConfig = {
  ...LOCKED_STACK,
  uiLibrary: 'Element Plus',
  requestLayer: 'Axios + TanStack Query',
  authStrategy: 'JWT + Passport',
  aiRationale: '主栈锁定 NestJS + Vue 3；UI 库选 Element Plus 与已有工作台风格一致，请求层用 TanStack Query 统一缓存与重试。',
}

export const DEFAULT_CONCURRENCY = 3
export const DEFAULT_MAX_FIX_ROUNDS = 3
export const DEFAULT_PAGE_SIZE = 20

/* ------------------------------------------------------------------ */
/* 向量检索（PRD 8.1 vector_embeddings 的 model/dim）                  */
/* ------------------------------------------------------------------ */

/** 内置伪嵌入（词袋）维度：node:sqlite 侧向量存储与召回共用，改维度需同步重建索引 */
export const EMBEDDING_DIM = 64
/** 当前使用的嵌入模型标识（写入 vector_embeddings.model） */
export const EMBEDDING_MODEL_ID = 'pseudo-bow-64'

/* ------------------------------------------------------------------ */
/* 其他常量                                                            */
/* ------------------------------------------------------------------ */

/** 目标项目工作区目录约定，见 PRD 8.4 */
export const WORKSPACE_PATHS = {
  web: 'apps/web',
  server: 'apps/server',
  shared: 'packages/shared',
  openapi: 'packages/shared/openapi.yaml',
  types: 'packages/shared/src/types.ts',
  zod: 'packages/shared/src/schemas.ts',
  prisma: 'packages/shared/prisma/schema.prisma',
  errorCodes: 'packages/shared/src/error-codes.ts',
  constants: 'packages/shared/src/constants.ts',
} as const
