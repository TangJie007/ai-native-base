import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/http-exception.filter'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: false })

  // 统一 API 前缀：/api/...
  app.setGlobalPrefix('api')
  app.enableCors({ origin: true, credentials: true })
  app.useGlobalFilters(new AllExceptionsFilter())

  const config = app.get(ConfigService)
  const port = config.get<number>('port') ?? 3000
  await app.listen(port)

  const logger = new Logger('Bootstrap')
  logger.log(`SpecForge 服务已启动：http://localhost:${port}/api`)
  logger.log(`WebSocket 命名空间：ws://localhost:${port}/ws`)
}

void bootstrap()
