import { createParamDecorator, ExecutionContext } from '@nestjs/common'

/** JWT 校验通过后挂在 request.user 上的用户信息 */
export interface AuthUser {
  id: string
  email: string
  name: string
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>()
  return request.user
})
