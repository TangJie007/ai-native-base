import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common'
import { saveDependenciesSchema, type DependencyGraph, type SaveDependenciesDto } from '@specforge/shared'
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { ProjectsService } from '../projects/projects.service'
import { DependenciesService } from './dependencies.service'

@Controller()
export class DependenciesController {
  constructor(
    private readonly dependencies: DependenciesService,
    private readonly projects: ProjectsService,
  ) {}

  @Get('projects/:projectId/dependencies')
  async get(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ): Promise<DependencyGraph> {
    await this.projects.assertOwned(user.id, projectId)
    return this.dependencies.get(projectId)
  }

  @Post('projects/:projectId/dependencies/generate')
  generate(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ): Promise<DependencyGraph> {
    return this.dependencies.generate(user.id, projectId)
  }

  @Put('projects/:projectId/dependencies')
  save(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(saveDependenciesSchema)) dto: SaveDependenciesDto,
  ): Promise<DependencyGraph> {
    return this.dependencies.save(user.id, projectId, dto)
  }

  @Post('projects/:projectId/dependencies/confirm')
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ): Promise<DependencyGraph> {
    return this.dependencies.confirm(user.id, projectId)
  }
}
