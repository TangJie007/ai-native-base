import type {
  AgentTrace,
  Assumption,
  Contract,
  ContractStats,
  ErrorSnapshot,
  FixRecord,
  ItemDependency,
  ModelTierBinding,
  ParsedSpec,
  Project,
  RegressionItem,
  RequirementDoc,
  RequirementItem,
  StackConfig,
  User,
  VerificationRun,
} from '@specforge/shared'

/**
 * Prisma 行 → 共享领域类型的映射。放在一处，避免每个 service 重复 cast Json 字段。
 * 行类型统一用宽松的 Row，代表 Prisma 生成类型；JSON 字段在这里收敛为强类型。
 */
export type Row = Record<string, any>

const iso = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value ?? ''))

const isoOrNull = (value: unknown): string | null =>
  value === null || value === undefined ? null : iso(value)

export function toUser(row: Row): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: iso(row.createdAt),
  }
}

export function toProject(row: Row): Project {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description ?? '',
    status: row.status,
    currentStage: row.currentStage,
    stackConfig: row.stackConfig as StackConfig,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

export function toRequirementDoc(row: Row): RequirementDoc {
  return {
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    fileName: row.fileName,
    rawContent: row.rawContent,
    parsedSpec: (row.parsedSpec as ParsedSpec | null) ?? null,
    createdAt: iso(row.createdAt),
  }
}

export function toRequirementItem(row: Row): RequirementItem {
  return {
    id: row.id,
    projectId: row.projectId,
    code: row.code,
    title: row.title,
    description: row.description ?? '',
    acceptance: (row.acceptance as string[]) ?? [],
    dependsOn: (row.dependsOn as string[]) ?? [],
    layer: row.layer,
    priority: row.priority,
    status: row.status,
    retryCount: row.retryCount ?? 0,
    filePaths: (row.filePaths as string[]) ?? [],
    errorSnapshot: (row.errorSnapshot as ErrorSnapshot | null) ?? null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

export function toAssumption(row: Row): Assumption {
  return {
    id: row.id,
    docId: row.docId,
    projectId: row.projectId,
    code: row.code,
    category: row.category,
    question: row.question,
    aiDefault: row.aiDefault,
    impact: row.impact ?? '',
    userAnswer: row.userAnswer ?? null,
    status: row.status,
    createdAt: iso(row.createdAt),
  }
}

export function toContract(row: Row): Contract {
  return {
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    openapiYaml: row.openapiYaml,
    tsTypes: row.tsTypes,
    zodSchemas: row.zodSchemas,
    prismaSchema: row.prismaSchema,
    errorCodes: row.errorCodes,
    constants: row.constants ?? '',
    locked: row.locked,
    lockedAt: isoOrNull(row.lockedAt),
    stats: row.stats as ContractStats,
    createdAt: iso(row.createdAt),
  }
}

export function toDependency(row: Row): ItemDependency {
  return {
    id: row.id,
    projectId: row.projectId,
    itemId: row.itemId,
    dependsOnId: row.dependsOnId,
    depType: row.depType,
  }
}

export function toAgentTrace(row: Row): AgentTrace {
  return {
    id: row.id,
    projectId: row.projectId,
    itemId: row.itemId ?? null,
    agentName: row.agentName,
    model: row.model,
    action: row.action ?? '',
    inputTokens: row.inputTokens ?? 0,
    outputTokens: row.outputTokens ?? 0,
    durationMs: row.durationMs ?? 0,
    inputSummary: row.inputSummary ?? '',
    outputSummary: row.outputSummary ?? '',
    status: row.status,
    createdAt: iso(row.createdAt),
  }
}

export function toVerificationRun(row: Row): VerificationRun {
  return {
    id: row.id,
    itemId: row.itemId,
    round: row.round,
    checkType: row.checkType,
    passed: row.passed,
    errorLog: row.errorLog ?? null,
    durationMs: row.durationMs ?? 0,
    createdAt: iso(row.createdAt),
  }
}

export function toFixRecord(row: Row): FixRecord {
  return {
    id: row.id,
    itemId: row.itemId,
    round: row.round,
    errorSnapshot: row.errorSnapshot as ErrorSnapshot,
    patch: row.patch ?? '',
    result: row.result,
    createdAt: iso(row.createdAt),
  }
}

export function toRegressionItem(row: Row): RegressionItem {
  return {
    id: row.id,
    projectId: row.projectId,
    itemId: row.itemId,
    text: row.text,
    checked: row.checked,
  }
}

export function toTierBindings(value: unknown): ModelTierBinding[] {
  return (value as ModelTierBinding[] | null) ?? []
}
