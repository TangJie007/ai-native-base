import { Injectable } from '@nestjs/common'
import {
  ErrorCode,
  type Contract,
  type ParsedSpec,
  type RequirementItem,
  type StackConfig,
} from '@specforge/shared'
import { conflict, notFound } from '../../common/app-exception'
import { toContract, toRequirementItem, type Row } from '../../common/mappers'
import { LlmService } from '../../infra/llm/llm.service'
import { VectorService } from '../../infra/vector/vector.service'
import { PrismaService } from '../../prisma/prisma.service'
import { AssumptionsService } from '../assumptions/assumptions.service'
import { ProjectsService } from '../projects/projects.service'
import { TraceService } from '../traces/trace.service'

const EMPTY_SPEC: ParsedSpec = {
  entities: [],
  stateMachines: [],
  rules: [],
  contradictions: [],
  summary: { itemCount: 0, entityCount: 0, stateMachineCount: 0, assumptionCount: 0 },
}

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly assumptions: AssumptionsService,
    private readonly llm: LlmService,
    private readonly traces: TraceService,
    private readonly vectors: VectorService,
  ) {}

  async latest(projectId: string): Promise<Contract> {
    const row = await this.prisma.contract.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    })
    if (!row) throw notFound(ErrorCode.CONTRACT_NOT_FOUND, { projectId })
    return toContract(row as unknown as Row)
  }

  /** S2：生成契约（PRD 4.3）。契约是「唯一事实来源」，生成后需人工锁定（卡点二）。 */
  async generate(userId: string, projectId: string): Promise<Contract> {
    const project = await this.projects.assertOwned(userId, projectId)

    // 已锁定契约视为冻结：禁止再生成新版本，避免 S4 用的锁定版本与最新版本不一致（B-11）
    const lockedExisting = await this.lockedContract(projectId)
    if (lockedExisting) {
      throw conflict(ErrorCode.CONTRACT_ALREADY_LOCKED, { projectId, contractId: lockedExisting.id })
    }

    const gate = await this.assumptions.gate(projectId)
    if (!gate.allowed) throw conflict(ErrorCode.ASSUMPTIONS_PENDING, gate)

    const itemRows = await this.prisma.requirementItem.findMany({
      where: { projectId },
      orderBy: { code: 'asc' },
    })
    if (itemRows.length === 0) throw conflict(ErrorCode.NO_REQUIREMENT_ITEMS)

    const doc = await this.prisma.requirementDoc.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    })
    const spec = (doc?.parsedSpec as ParsedSpec | null) ?? EMPTY_SPEC
    const items: RequirementItem[] = itemRows.map((row) => toRequirementItem(row as unknown as Row))

    const generated = await this.traces.track(
      { projectId, action: 'S2 契约生成', inputSummary: `${items.length} 个条目`, agent: 'contract' },
      () =>
        this.llm.generateContract(userId, {
          spec,
          items,
          stackConfig: project.stackConfig as StackConfig,
        }),
    )

    const last = await this.prisma.contract.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    })
    const version = (last?.version ?? 0) + 1

    const row = await this.prisma.contract.create({
      data: {
        projectId,
        version,
        openapiYaml: generated.openapiYaml,
        tsTypes: generated.tsTypes,
        zodSchemas: generated.zodSchemas,
        prismaSchema: generated.prismaSchema,
        errorCodes: generated.errorCodes,
        constants: generated.constants,
        stats: generated.stats as unknown as object,
      },
    })

    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'awaiting_contract', currentStage: 'S2' },
    })

    this.vectors.upsert({
      ownerType: 'contract',
      ownerId: row.id,
      projectId,
      model: 'pseudo-bow-64',
      text: generated.openapiYaml,
    })

    return toContract(row as unknown as Row)
  }

  /** 卡点二：锁定契约后才允许生成依赖图（PRD 3.2 CT-08） */
  async lock(userId: string, projectId: string, contractId: string): Promise<Contract> {
    await this.projects.assertOwned(userId, projectId)
    const existing = await this.prisma.contract.findUnique({ where: { id: contractId } })
    if (!existing || existing.projectId !== projectId) {
      throw notFound(ErrorCode.CONTRACT_NOT_FOUND, { contractId })
    }
    if (existing.locked) throw conflict(ErrorCode.CONTRACT_ALREADY_LOCKED, { contractId })

    const row = await this.prisma.contract.update({
      where: { id: contractId },
      data: { locked: true, lockedAt: new Date() },
    })
    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'awaiting_dependencies', currentStage: 'S3' },
    })
    return toContract(row as unknown as Row)
  }

  async lockedContract(projectId: string): Promise<Contract | null> {
    const row = await this.prisma.contract.findFirst({
      where: { projectId, locked: true },
      orderBy: { version: 'desc' },
    })
    return row ? toContract(row as unknown as Row) : null
  }
}
