import { Controller, Get, Param, Post } from '@nestjs/common'
import type { Contract } from '@specforge/shared'
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator'
import { ProjectsService } from '../projects/projects.service'
import { ContractsService } from './contracts.service'

@Controller()
export class ContractsController {
  constructor(
    private readonly contracts: ContractsService,
    private readonly projects: ProjectsService,
  ) {}

  @Get('projects/:projectId/contracts/latest')
  async latest(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ): Promise<Contract> {
    await this.projects.assertOwned(user.id, projectId)
    return this.contracts.latest(projectId)
  }

  @Post('projects/:projectId/contracts/generate')
  generate(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string): Promise<Contract> {
    return this.contracts.generate(user.id, projectId)
  }

  @Post('projects/:projectId/contracts/:contractId/lock')
  lock(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('contractId') contractId: string,
  ): Promise<Contract> {
    return this.contracts.lock(user.id, projectId, contractId)
  }
}
