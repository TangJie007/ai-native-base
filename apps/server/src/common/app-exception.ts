import { HttpException, HttpStatus } from '@nestjs/common'
import { ErrorCode, ERROR_MESSAGES } from '@specforge/shared'

/**
 * 统一业务异常：响应体固定为 { code, message, details }，与前端 client.ts 的约定一致。
 */
export class AppException extends HttpException {
  constructor(code: ErrorCode, status: HttpStatus = HttpStatus.BAD_REQUEST, details?: unknown) {
    super({ code, message: ERROR_MESSAGES[code] ?? code, details }, status)
  }
}

export const notFound = (code: ErrorCode = ErrorCode.NOT_FOUND, details?: unknown) =>
  new AppException(code, HttpStatus.NOT_FOUND, details)

export const badRequest = (code: ErrorCode, details?: unknown) =>
  new AppException(code, HttpStatus.BAD_REQUEST, details)

export const conflict = (code: ErrorCode, details?: unknown) =>
  new AppException(code, HttpStatus.CONFLICT, details)

export const forbidden = (code: ErrorCode = ErrorCode.FORBIDDEN, details?: unknown) =>
  new AppException(code, HttpStatus.FORBIDDEN, details)
