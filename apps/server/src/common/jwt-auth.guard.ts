import { ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { ErrorCode } from '@specforge/shared'
import { AppException } from './app-exception'
import { IS_PUBLIC_KEY } from './public.decorator'

/**
 * 全局默认守卫：除标注 @Public() 的路由外，一律要求 Bearer JWT。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super()
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true
    return super.canActivate(context)
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw new AppException(ErrorCode.UNAUTHORIZED, 401)
    }
    return user
  }
}
