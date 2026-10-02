import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import {
  createItemSchema,
  importRequirementDocSchema,
  updateItemSchema,
  type CreateItemDto,
  type ImportRequirementDocDto,
  type RequirementItem,
  type UpdateItemDto,
} from '@specforge/shared'
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { ProjectsService } from '../projects/projects.service'
import {
  RequirementsService,
  type ImportRequirementsResult,
  type RequirementsPayload,
} from './requirements.service'

@Controller()
export class RequirementsController {
  constructor(
    private readonly requirements: RequirementsService,
    private readonly projects: ProjectsService,
  ) {}

  @Get('projects/:projectId/requirements')
  async get(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ): Promise<RequirementsPayload> {
    await this.projects.assertOwned(user.id, projectId)
    return this.requirements.get(projectId)
  }

  @Post('projects/:projectId/requirements/import')
  import(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(importRequirementDocSchema)) dto: ImportRequirementDocDto,
  ): Promise<ImportRequirementsResult> {
    return this.requirements.import(user.id, projectId, dto)
  }

  @Get('projects/:projectId/items')
  async listItems(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ): Promise<RequirementItem[]> {
    await this.projects.assertOwned(user.id, projectId)
    return this.requirements.listItems(projectId)
  }

  @Post('projects/:projectId/items')
  async createItem(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(createItemSchema)) dto: CreateItemDto,
  ): Promise<RequirementItem> {
    await this.projects.assertOwned(user.id, projectId)
    return this.requirements.createItem(projectId, dto)
  }

  @Patch('items/:itemId')
  async updateItem(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(updateItemSchema)) dto: UpdateItemDto,
  ): Promise<RequirementItem> {
    await this.projects.assertItemOwned(user.id, itemId)
    return this.requirements.updateItem(itemId, dto)
  }

  @Delete('items/:itemId')
  async removeItem(@CurrentUser() user: AuthUser, @Param('itemId') itemId: string): Promise<void> {
    await this.projects.assertItemOwned(user.id, itemId)
    return this.requirements.removeItem(itemId)
  }
}
