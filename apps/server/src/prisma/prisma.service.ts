import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

/**
 * Prisma 客户端封装（MySQL 业务库）。
 * 连接失败时只打印中文提示、不退出进程，便于 /api/health 仍可用于排查环境问题。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)
  private connectedFlag = false

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect()
      this.connectedFlag = true
      this.logger.log('MySQL 业务库连接成功')
    } catch (error) {
      this.connectedFlag = false
      this.logger.error('MySQL 连接失败：请确认数据库已启动，且 apps/server/.env 中的 DATABASE_URL 正确。')
      this.logger.error(error instanceof Error ? error.message : String(error))
      this.logger.warn('服务将继续启动，但涉及数据库的接口会报错。')
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }

  get isConnected(): boolean {
    return this.connectedFlag
  }
}
