import { Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ErrorCode, type SandboxFile, type SandboxState } from '@specforge/shared'
import { badRequest, notFound } from '../../common/app-exception'
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator'
import { SandboxService } from '../../infra/sandbox/sandbox.service'
import { ProjectsService } from '../projects/projects.service'

export interface SandboxFileContent {
  path: string
  content: string
}

/** 沙箱只读视图 + 手动创建（PRD 8.2），执行期由 PipelineService 自动写入 */
@Controller('projects/:projectId/sandbox')
export class SandboxController {
  constructor(
    private readonly sandbox: SandboxService,
    private readonly projects: ProjectsService,
  ) {}

  @Get()
  async state(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ): Promise<SandboxState> {
    await this.projects.assertOwned(user.id, projectId)
    return this.sandbox.state(projectId)
  }

  @Post('create')
  async create(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ): Promise<SandboxState> {
    await this.projects.assertOwned(user.id, projectId)
    return this.sandbox.create(projectId)
  }

  @Get('files')
  async files(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ): Promise<SandboxFile[]> {
    await this.projects.assertOwned(user.id, projectId)
    return this.sandbox.list(projectId)
  }

  @Get('file')
  async file(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Query('path') path: string,
  ): Promise<SandboxFileContent> {
    await this.projects.assertOwned(user.id, projectId)
    if (!path) throw badRequest(ErrorCode.VALIDATION_FAILED, { reason: '缺少 path 查询参数' })
    const content = await this.sandbox.readFile(projectId, path)
    if (content === null) throw notFound(ErrorCode.NOT_FOUND, { path })
    return { path, content }
  }
}
