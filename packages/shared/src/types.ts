/**
 * SpecForge 领域类型定义。
 * 这是前后端共享的唯一事实来源：NestJS 的 DTO 与 Vue 的 API 层同时 import 本文件，
 * 字段一旦改名，两边同时编译报错。
 */

/* ------------------------------------------------------------------ */
/* 枚举（字符串联合）                                                   */
/* ------------------------------------------------------------------ */

/** 需求条目状态机，见 PRD 5.1 */
export type ItemStatus =
  | 'pending'
  | 'blocked'
  | 'generating'
  | 'verifying'
  | 'fixing'
  | 'passed'
  | 'failed'
  | 'needs_human'

/** 条目归属层级，见 PRD 5.2 */
export type ItemLayer = 'frontend' | 'backend' | 'data' | 'fullstack'

export type ItemPriority = 'P0' | 'P1' | 'P2'

/** 流水线五阶段，见 PRD 4.1 */
export type StageKey = 'S1' | 'S2' | 'S3' | 'S4' | 'S5'

export type StageState = 'todo' | 'active' | 'done'

/** 项目整体状态 */
export type ProjectStatus =
  | 'draft'
  | 'parsing'
  | 'awaiting_assumptions'
  | 'awaiting_contract'
  | 'awaiting_dependencies'
  | 'generating'
  | 'verifying'
  | 'awaiting_regression'
  | 'delivered'
  | 'paused'
  | 'failed'

/** 假设分类，见 PRD 4.2 */
export type AssumptionCategory =
  | 'business_rule'
  | 'data_field'
  | 'interaction'
  | 'permission'
  | 'exception'

/** 假设状态，见 PRD 4.2 */
export type AssumptionStatus = 'pending' | 'confirmed' | 'default'

/** 依赖类型，见 PRD 4.4 */
export type DependencyType = 'data' | 'api' | 'page' | 'none'

/** 验证检查项，见 PRD 4.6 / 7.1 */
export type VerificationCheckType =
  | 'install'
  | 'typecheck'
  | 'lint'
  | 'build'
  | 'unit_test'
  | 'smoke_test'
  | 'e2e_test'
  | 'security_scan'

/** Agent 角色，见 PRD 8.3 */
export type AgentName =
  | 'parser'
  | 'contract'
  | 'architect'
  | 'scaffold'
  | 'frontend'
  | 'backend'
  | 'test'
  | 'fixer'
  | 'reviewer'

/** 模型档位，见 PRD 10 */
export type ModelTier = 'high' | 'value' | 'medium'

export type TraceStatus = 'running' | 'success' | 'failed'

/** 人在环卡点，见 PRD 6.1 */
export type GateKey = 'assumptions' | 'contract' | 'dependencies' | 'regression'

/* ------------------------------------------------------------------ */
/* 实体                                                               */
/* ------------------------------------------------------------------ */

export interface User {
  id: string
  email: string
  name: string
  createdAt: string
}

export interface AuthResult {
  token: string
  user: User
}

export interface Project {
  id: string
  userId: string
  name: string
  description: string
  status: ProjectStatus
  currentStage: StageKey
  /** 生成目标栈的次级选型（主栈锁定，见 PRD 8.4） */
  stackConfig: StackConfig
  createdAt: string
  updatedAt: string
}

/** 生成目标项目技术栈配置：主栈锁定，次级项可调，见 PRD 8.4 */
export interface StackConfig {
  frontend: 'Vue 3 + TypeScript + Vite'
  state: 'Pinia'
  backend: 'NestJS + TypeScript'
  database: 'MySQL'
  orm: 'Prisma'
  router: 'Vue Router'
  uiLibrary: 'Element Plus' | 'Naive UI' | 'Ant Design Vue'
  requestLayer: 'Axios + TanStack Query' | 'Axios 封装'
  authStrategy: 'JWT + Passport' | 'JWT + 自定义 Guard'
  testFramework: 'Vitest + Supertest + Playwright'
  packageManager: 'pnpm'
  monorepo: 'pnpm workspace'
  /** AI 推荐说明，用户可在前端覆盖次级选型 */
  aiRationale?: string
}

export interface ProjectStats {
  itemsTotal: number
  itemsDone: number
  progress: number
  passRate: string
  cost: string
  duration: string
  statusCounts: Record<ItemStatus, number>
}

export interface RecentProject {
  id: string
  name: string
  stage: string
  status: ProjectStatus
  statusLabel: string
  updatedAt: string
  passRate: string
}

/** 仪表盘聚合数据 */
export interface DashboardData {
  projects: ProjectCard[]
  stats: DashboardStat[]
  recentProjects: RecentProject[]
}

export interface DashboardStat {
  value: string
  label: string
  suffix: string
}

export interface ProjectCard {
  id: string
  name: string
  subtitle: string
  progress: number
  itemsDone: number
  itemsTotal: number
  passRate: string
  cost: string
  duration: string
  features: string[]
  stage: string
}

/** 需求文档版本，见 PRD 9 requirement_docs */
export interface RequirementDoc {
  id: string
  projectId: string
  version: number
  fileName: string
  rawContent: string
  parsedSpec: ParsedSpec | null
  createdAt: string
}

/** 解析产出的结构化 Spec，见 PRD 4.2 */
export interface ParsedSpec {
  entities: ParsedEntity[]
  stateMachines: ParsedStateMachine[]
  rules: string[]
  contradictions: string[]
  summary: {
    itemCount: number
    entityCount: number
    stateMachineCount: number
    assumptionCount: number
  }
}

export interface ParsedEntity {
  name: string
  fields: { name: string; type: string; required: boolean; note?: string }[]
  enums: { name: string; values: string[] }[]
}

export interface ParsedStateMachine {
  name: string
  states: string[]
  transitions: { from: string; to: string; trigger: string }[]
}

/** 需求条目，见 PRD 5.2 */
export interface RequirementItem {
  id: string
  projectId: string
  code: string
  title: string
  description: string
  acceptance: string[]
  dependsOn: string[]
  layer: ItemLayer
  priority: ItemPriority
  status: ItemStatus
  retryCount: number
  filePaths: string[]
  errorSnapshot: ErrorSnapshot | null
  createdAt: string
  updatedAt: string
}

export interface ErrorSnapshot {
  message: string
  checkType: VerificationCheckType
  round: number
  output: string
  at: string
}

/** 假设清单，见 PRD 4.2 */
export interface Assumption {
  id: string
  docId: string
  projectId: string
  code: string
  category: AssumptionCategory
  question: string
  aiDefault: string
  impact: string
  userAnswer: string | null
  status: AssumptionStatus
  createdAt: string
}

export interface AssumptionsGate {
  allowed: boolean
  total: number
  resolved: number
  pending: number
  blockedReason: string | null
}

/** 契约，见 PRD 4.3 / 9 */
export interface Contract {
  id: string
  projectId: string
  version: number
  openapiYaml: string
  tsTypes: string
  zodSchemas: string
  prismaSchema: string
  errorCodes: string
  constants: string
  locked: boolean
  lockedAt: string | null
  stats: ContractStats
  createdAt: string
}

export interface ContractStats {
  endpointCount: number
  typeFieldCount: number
  tableCount: number
  enumCount: number
  tscPassed: boolean
}

export interface ContractSummary {
  id: string
  version: number
  locked: boolean
  lockedAt: string | null
  stats: ContractStats
  createdAt: string
}

/** 依赖边，见 PRD 4.4 */
export interface ItemDependency {
  id: string
  projectId: string
  itemId: string
  dependsOnId: string
  depType: DependencyType
}

export interface DependencyGraph {
  projectId: string
  confirmed: boolean
  edges: DAGEdge[]
  batches: ExecutionBatch[]
  cycleRemoved: number
}

export interface DAGEdge {
  id: string
  itemId: string
  itemCode: string
  itemTitle: string
  itemLayer: ItemLayer
  dependsOnId: string
  dependsOnCode: string
  depType: DependencyType
}

export interface ExecutionBatch {
  batch: number
  parallel: number
  nodes: { id: string; code: string; title: string; layer: ItemLayer }[]
}

/** Agent 轨迹，见 PRD 9 agent_traces */
export interface AgentTrace {
  id: string
  projectId: string
  itemId: string | null
  agentName: AgentName
  model: string
  action: string
  inputTokens: number
  outputTokens: number
  durationMs: number
  inputSummary: string
  outputSummary: string
  status: TraceStatus
  createdAt: string
}

export interface TraceSummary {
  totalCalls: number
  inputTokens: number
  outputTokens: number
  cost: string
  modelCount: number
}

export interface TracesPayload {
  summary: TraceSummary
  entries: AgentTrace[]
}

/** 验证记录，见 PRD 9 verification_runs */
export interface VerificationRun {
  id: string
  itemId: string
  round: number
  checkType: VerificationCheckType
  passed: boolean
  errorLog: string | null
  durationMs: number
  createdAt: string
}

/** 修复记录，见 PRD 9 fix_records */
export interface FixRecord {
  id: string
  itemId: string
  round: number
  errorSnapshot: ErrorSnapshot
  patch: string
  result: 'success' | 'failed' | 'needs_human'
  createdAt: string
}

/** 模型配置，见 PRD 10 */
export interface ModelSettings {
  provider: string
  baseUrl: string
  /** 密钥仅服务端存储，下发时永远为 null */
  apiKey: string | null
  apiKeyConfigured: boolean
  tiers: ModelTierBinding[]
  fallbackModel: string
}

export interface ModelTierBinding {
  tier: ModelTier
  model: string
  stages: string[]
}

/** 沙箱文件，见 PRD 8.2 */
export interface SandboxFile {
  path: string
  size: number
  updatedAt: string
}

export interface SandboxState {
  sandboxId: string | null
  status: 'none' | 'creating' | 'ready' | 'destroyed' | 'error'
  provider: 'mock' | 'e2b' | 'docker'
  files: SandboxFile[]
  previewUrl: string | null
  updatedAt: string | null
}

/** 流水线状态，见 PRD 4.1 / 6.3 */
export interface PipelineStatus {
  projectId: string
  running: boolean
  currentStage: StageKey
  stages: StageInfo[]
  concurrency: number
  maxFixRounds: number
  regressionChecklist: RegressionItem[]
  summary: string
}

export interface StageInfo {
  key: StageKey
  label: string
  state: StageState
}

/** 人工回归清单，见 PRD 3.4 VER-08 */
export interface RegressionItem {
  id: string
  projectId: string
  itemId: string
  text: string
  checked: boolean
}

/* ------------------------------------------------------------------ */
/* 通用响应包装                                                        */
/* ------------------------------------------------------------------ */

export interface ApiError {
  code: string
  message: string
  details?: unknown
}

export interface Paginated<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}
