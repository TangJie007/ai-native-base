import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import {
  checkRegressionSchema,
  resolveItemSchema,
  startPipelineSchema,
  type CheckRegressionDto,
  type FixRecord,
  type PipelineStatus,
  type RegressionItem,
  type RequirementItem,
  type ResolveItemDto,
  type StartPipelineDto,
  type VerificationRun,
} from '@specforge/shared'
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { PipelineService } from './pipeline.service'

@Controller()
export class PipelineController {
  constructor(private readonly pipeline: PipelineService) {}

  /* ------------------------------ 流水线控制 ------------------------------ */

  @Get('projects/:projectId/pipeline')
  status(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ): Promise<PipelineStatus> {
    return this.pipeline.status(user.id, projectId)
  }

  @Post('projects/:projectId/pipeline/start')
  start(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(startPipelineSchema)) dto: StartPipelineDto,
  ): Promise<PipelineStatus> {
    return this.pipeline.start(user.id, projectId, dto)
  }

  @Post('projects/:projectId/pipeline/interrupt')
  interrupt(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ): Promise<PipelineStatus> {
    return this.pipeline.interrupt(user.id, projectId)
  }

  /* ------------------------------ 条目人工处理 ------------------------------ */

  @Post('items/:itemId/resolve')
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(resolveItemSchema)) dto: ResolveItemDto,
  ): Promise<RequirementItem> {
    return this.pipeline.resolveItem(user.id, itemId, dto)
  }

  @Get('items/:itemId/verifications')
  verifications(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
  ): Promise<VerificationRun[]> {
    return this.pipeline.listVerifications(user.id, itemId)
  }

  @Get('items/:itemId/fixes')
  fixes(@CurrentUser() user: AuthUser, @Param('itemId') itemId: string): Promise<FixRecord[]> {
    return this.pipeline.listFixes(user.id, itemId)
  }

  /* ------------------------------ 人工回归 ------------------------------ */

  @Get('projects/:projectId/regression')
  regression(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ): Promise<RegressionItem[]> {
    return this.pipeline.listRegression(user.id, projectId)
  }

  @Patch('projects/:projectId/regression/check')
  checkRegression(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(checkRegressionSchema)) dto: CheckRegressionDto,
  ): Promise<PipelineStatus> {
    return this.pipeline.checkRegression(user.id, projectId, dto)
  }
}
