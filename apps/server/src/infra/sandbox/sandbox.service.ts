import { Inject, Injectable } from '@nestjs/common'
import type { RequirementItem, SandboxFile, SandboxState } from '@specforge/shared'
import { PrismaService } from '../../prisma/prisma.service'
import type { GeneratedFile } from '../llm/llm.types'
import { SANDBOX_PROVIDER, type SandboxCheckResult, type SandboxProvider } from './sandbox.types'

/**
 * 沙箱门面：对外提供项目级沙箱状态与文件读写/检查能力，
 * 同时把文件清单镜像到业务库 sandboxes 表，便于前端展示与断点续跑。
 */
@Injectable()
export class SandboxService {
  constructor(
    @Inject(SANDBOX_PROVIDER) private readonly provider: SandboxProvider,
    private readonly prisma: PrismaService,
  ) {}

  get providerName(): SandboxProvider['name'] {
    return this.provider.name
  }

  async state(projectId: string): Promise<SandboxState> {
    const row = await this.prisma.sandbox.findUnique({ where: { projectId } })
    if (!row) {
      return {
        sandboxId: null,
        status: 'none',
        provider: this.provider.name,
        files: [],
        previewUrl: null,
        updatedAt: null,
      }
    }
    return {
      sandboxId: row.id,
      status: row.status as SandboxState['status'],
      provider: row.provider as SandboxState['provider'],
      files: (row.files as unknown as SandboxFile[]) ?? [],
      previewUrl: row.previewUrl,
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  async create(projectId: string): Promise<SandboxState> {
    await this.provider.create(projectId)
    const previewUrl = this.provider.previewUrl(projectId)
    await this.prisma.sandbox.upsert({
      where: { projectId },
      create: { projectId, provider: this.provider.name, status: 'ready', previewUrl, files: [] },
      update: { provider: this.provider.name, status: 'ready', previewUrl },
    })
    return this.state(projectId)
  }

  /** 生成代码后写入沙箱，并同步文件清单 */
  async write(projectId: string, files: GeneratedFile[]): Promise<SandboxFile[]> {
    await this.provider.create(projectId)
    await this.provider.write(projectId, files)
    const list = await this.provider.list(projectId)
    await this.prisma.sandbox.upsert({
      where: { projectId },
      create: {
        projectId,
        provider: this.provider.name,
        status: 'ready',
        previewUrl: this.provider.previewUrl(projectId),
        files: list as unknown as object[],
      },
      update: { status: 'ready', files: list as unknown as object[] },
    })
    return list
  }

  async list(projectId: string): Promise<SandboxFile[]> {
    return this.provider.list(projectId)
  }

  async readFile(projectId: string, path: string): Promise<string | null> {
    return this.provider.read(projectId, path)
  }

  async runChecks(
    projectId: string,
    item: RequirementItem,
    round: number,
    files: GeneratedFile[],
  ): Promise<SandboxCheckResult[]> {
    return this.provider.runChecks(projectId, item, round, files)
  }

  async destroy(projectId: string): Promise<void> {
    await this.provider.destroy(projectId)
    await this.prisma.sandbox.updateMany({ where: { projectId }, data: { status: 'destroyed', files: [] } })
  }
}
