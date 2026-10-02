import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import type { AuthUser } from '../../common/current-user.decorator'

interface JwtPayload {
  sub: string
  email: string
  name: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.secret'),
    })
  }

  /** 返回值挂到 request.user，供 @CurrentUser() 取用 */
  validate(payload: JwtPayload): AuthUser {
    return { id: payload.sub, email: payload.email, name: payload.name }
  }
}
