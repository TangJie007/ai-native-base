import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { ErrorCode, type AuthResult, type LoginDto, type RegisterDto, type User } from '@specforge/shared'
import { AppException, conflict, notFound } from '../../common/app-exception'
import { toUser } from '../../common/mappers'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (existing) throw conflict(ErrorCode.CONFLICT, { email: dto.email })

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name?.trim() || dto.email.split('@')[0],
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
    })
    return this.buildAuthResult(user)
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (!user) throw new AppException(ErrorCode.UNAUTHORIZED, 401)
    const ok = await bcrypt.compare(dto.password, user.passwordHash)
    if (!ok) throw new AppException(ErrorCode.UNAUTHORIZED, 401)
    return this.buildAuthResult(user)
  }

  async me(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw notFound()
    return toUser(user)
  }

  private buildAuthResult(user: { id: string; email: string; name: string; createdAt: Date }): AuthResult {
    return {
      token: this.jwt.sign({ sub: user.id, email: user.email, name: user.name }),
      user: toUser(user),
    }
  }
}
