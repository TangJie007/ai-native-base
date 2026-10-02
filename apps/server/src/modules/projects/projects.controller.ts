import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import {
  createProjectSchema,
  updateProjectSchema,
  type CreateProjectDto,
  type DashboardData,
  type Project,
  type ProjectStats,
  type UpdateProjectDto,
} from '@specforge/shared'
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { ProjectsService } from './projects.service'

@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser): Promise<DashboardData> {
    return this.projects.dashboard(user.id)
  }

  @Get('projects')
  list(@CurrentUser() user: AuthUser): Promise<Project[]> {
    return this.projects.list(user.id)
  }

  @Post('projects')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createProjectSchema)) dto: CreateProjectDto,
  ): Promise<Project> {
    return this.projects.create(user.id, dto)
  }

  @Get('projects/:projectId')
  get(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string): Promise<Project> {
    return this.projects.get(user.id, projectId)
  }

  @Patch('projects/:projectId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) dto: UpdateProjectDto,
  ): Promise<Project> {
    return this.projects.update(user.id, projectId, dto)
  }

  @Delete('projects/:projectId')
  remove(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string): Promise<void> {
    return this.projects.remove(user.id, projectId)
  }

  @Get('projects/:projectId/stats')
  stats(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string): Promise<ProjectStats> {
    return this.projects.stats(user.id, projectId)
  }
}
