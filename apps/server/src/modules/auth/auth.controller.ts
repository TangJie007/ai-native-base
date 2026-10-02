import { Body, Controller, Get, Post } from '@nestjs/common'
import {
  loginSchema,
  registerSchema,
  type AuthResult,
  type LoginDto,
  type RegisterDto,
  type User,
} from '@specforge/shared'
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator'
import { Public } from '../../common/public.decorator'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { AuthService } from './auth.service'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto): Promise<AuthResult> {
    return this.auth.register(dto)
  }

  @Public()
  @Post('login')
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto): Promise<AuthResult> {
    return this.auth.login(dto)
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<User> {
    return this.auth.me(user.id)
  }
}
