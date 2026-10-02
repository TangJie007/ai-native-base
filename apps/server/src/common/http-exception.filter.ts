import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import type { Response } from 'express'
import { ErrorCode, ERROR_MESSAGES } from '@specforge/shared'

/**
 * 兜底异常过滤器：把任意异常收敛成 { code, message, details }。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter')

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let body: { code: string; message: string; details?: unknown } = {
      code: ErrorCode.INTERNAL_ERROR,
      message: ERROR_MESSAGES[ErrorCode.INTERNAL_ERROR],
    }

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const res = exception.getResponse()
      if (typeof res === 'object' && res !== null && 'code' in res) {
        body = res as typeof body
      } else {
        body = {
          code: status === HttpStatus.UNAUTHORIZED ? ErrorCode.UNAUTHORIZED : ErrorCode.INTERNAL_ERROR,
          message: typeof res === 'string' ? res : ERROR_MESSAGES[ErrorCode.INTERNAL_ERROR],
        }
      }
    } else {
      const message = exception instanceof Error ? exception.message : String(exception)
      this.logger.error(message, exception instanceof Error ? exception.stack : undefined)
      body = { code: ErrorCode.INTERNAL_ERROR, message: ERROR_MESSAGES[ErrorCode.INTERNAL_ERROR], details: message }
    }

    response.status(status).json(body)
  }
}
