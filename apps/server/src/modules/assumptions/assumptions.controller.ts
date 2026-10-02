import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import {
  updateAssumptionSchema,
  type Assumption,
  type AssumptionsGate,
  type UpdateAssumptionDto,
} from '@specforge/shared'
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { ProjectsService } from '../projects/projects.service'
import { AssumptionsService } from './assumptions.service'

@Controller()
export class AssumptionsController {
  constructor(
    private readonly assumptions: AssumptionsService,
    private readonly projects: ProjectsService,
  ) {}

  @Get('projects/:projectId/assumptions')
  async list(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string): Promise<Assumption[]> {
    await this.projects.assertOwned(user.id, projectId)
    return this.assumptions.list(projectId)
  }

  @Get('projects/:projectId/assumptions/gate')
  async gate(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ): Promise<AssumptionsGate> {
    await this.projects.assertOwned(user.id, projectId)
    return this.assumptions.gate(projectId)
  }

  @Patch('assumptions/:assumptionId')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('assumptionId') assumptionId: string,
    @Body(new ZodValidationPipe(updateAssumptionSchema)) dto: UpdateAssumptionDto,
  ): Promise<Assumption> {
    const projectId = await this.assumptions.projectIdOf(assumptionId)
    await this.projects.assertOwned(user.id, projectId)
    return this.assumptions.update(assumptionId, dto)
  }

  @Post('projects/:projectId/assumptions/confirm-all')
  async confirmAll(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ): Promise<Assumption[]> {
    await this.projects.assertOwned(user.id, projectId)
    return this.assumptions.confirmAll(projectId)
  }
}
