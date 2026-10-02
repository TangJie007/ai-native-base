import { Controller, Get, Param } from '@nestjs/common'
import type { AgentTrace, TracesPayload } from '@specforge/shared'
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator'
import { ProjectsService } from '../projects/projects.service'
import { TracesService } from './traces.service'

@Controller()
export class TracesController {
  constructor(
    private readonly traces: TracesService,
    private readonly projects: ProjectsService,
  ) {}

  @Get('projects/:projectId/traces')
  async list(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ): Promise<TracesPayload> {
    await this.projects.assertOwned(user.id, projectId)
    return this.traces.list(projectId)
  }

  @Get('items/:itemId/traces')
  async listByItem(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
  ): Promise<AgentTrace[]> {
    const projectId = await this.traces.projectIdOfItem(itemId)
    await this.projects.assertOwned(user.id, projectId)
    return this.traces.listByItem(itemId)
  }
}
