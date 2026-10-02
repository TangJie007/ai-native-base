import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common'
import type { ZodSchema } from 'zod'
import { ErrorCode, ERROR_MESSAGES } from '@specforge/shared'

/**
 * 直接用 @specforge/shared 里的 Zod schema 校验请求体，保证前后端校验规则同源。
 * 用法：@Body(new ZodValidationPipe(createProjectSchema)) dto: CreateProjectDto
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: ERROR_MESSAGES.VALIDATION_FAILED,
        details: result.error.flatten(),
      })
    }
    return result.data
  }
}
