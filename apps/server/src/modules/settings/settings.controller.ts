import { Body, Controller, Get, Post, Put } from '@nestjs/common'
import {
  testModelSchema,
  updateModelSettingsSchema,
  type ModelSettings,
  type TestModelDto,
  type UpdateModelSettingsDto,
} from '@specforge/shared'
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { SettingsService } from './settings.service'

@Controller('settings/models')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@CurrentUser() user: AuthUser): Promise<ModelSettings> {
    return this.settings.get(user.id)
  }

  @Put()
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateModelSettingsSchema)) dto: UpdateModelSettingsDto,
  ): Promise<ModelSettings> {
    return this.settings.update(user.id, dto)
  }

  @Post('test')
  test(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(testModelSchema)) dto: TestModelDto,
  ): Promise<{ ok: boolean; message: string }> {
    return this.settings.test(user.id, dto.model, dto.prompt)
  }
}
