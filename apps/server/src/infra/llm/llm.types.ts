import type {
  AssumptionCategory,
  Contract,
  ContractStats,
  DependencyType,
  ErrorSnapshot,
  ItemLayer,
  ItemPriority,
  ParsedSpec,
  RequirementItem,
  StackConfig,
} from '@specforge/shared'

/** 单次调用的 token 用量，用于 agent_traces 记录与成本统计 */
export interface LlmUsage {
  model: string
  inputTokens: number
  outputTokens: number
}

export interface GeneratedItem {
  code: string
  title: string
  description: string
  acceptance: string[]
  /** 逻辑依赖的条目 code（非 id），落库后由 DependencyService 解析成 DAG */
  dependsOn: string[]
  layer: ItemLayer
  priority: ItemPriority
}

export interface GeneratedAssumption {
  code: string
  category: AssumptionCategory
  question: string
  aiDefault: string
  impact: string
}

export interface ParsedRequirementResult {
  spec: ParsedSpec
  items: GeneratedItem[]
  assumptions: GeneratedAssumption[]
}

export interface GeneratedContract {
  openapiYaml: string
  tsTypes: string
  zodSchemas: string
  prismaSchema: string
  errorCodes: string
  constants: string
  stats: ContractStats
}

export interface GeneratedDependency {
  itemCode: string
  dependsOnCode: string
  depType: DependencyType
}

export interface GeneratedFile {
  path: string
  content: string
}

export interface GeneratedFix {
  patch: string
  files: GeneratedFile[]
}

/** 单次修复尝试的历史记录，供下一轮修复参考，避免重复无效改动（PRD 7.2） */
export interface FixAttempt {
  round: number
  checkType: string
  message: string
  output: string
  patch: string
}

/**
 * 模型适配器接口。默认 MockLlmProvider（确定性算法，零外部依赖）；
 * 配置 LLM_PROVIDER=openai + API Key 后切换为 OpenAiCompatibleProvider。
 */
export interface LlmProvider {
  readonly name: string
  /** 是否具备真实调用能力（mock 恒为 true） */
  isAvailable(): boolean

  parseRequirement(input: {
    model: string
    content: string
    fileName: string
    projectName: string
    stackConfig: StackConfig
  }): Promise<{ result: ParsedRequirementResult; usage: LlmUsage }>

  generateContract(input: {
    model: string
    spec: ParsedSpec
    items: RequirementItem[]
    stackConfig: StackConfig
  }): Promise<{ result: GeneratedContract; usage: LlmUsage }>

  analyzeDependencies(input: {
    model: string
    items: RequirementItem[]
    contract: Contract | null
  }): Promise<{ result: GeneratedDependency[]; usage: LlmUsage }>

  generateItemCode(input: {
    model: string
    item: RequirementItem
    contract: Contract | null
    stackConfig: StackConfig
  }): Promise<{ result: GeneratedFile[]; usage: LlmUsage }>

  fixError(input: {
    model: string
    item: RequirementItem
    error: ErrorSnapshot
    files: GeneratedFile[]
    round: number
    /** 之前各轮修复尝试，避免重复无效方案 */
    history: FixAttempt[]
  }): Promise<{ result: GeneratedFix; usage: LlmUsage }>
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER')
