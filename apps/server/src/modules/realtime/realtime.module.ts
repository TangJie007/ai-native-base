import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { ProjectsModule } from '../projects/projects.module'
import { PipelineGateway } from './pipeline.gateway'

/**
 * 全局实时推送模块：任何业务模块都可注入 PipelineGateway 发事件，
 * 避免 pipeline / traces / sandbox 之间互相 import 造成循环依赖。
 * 引入 ProjectsModule 用于 WebSocket 订阅时的项目归属校验。
 */
@Global()
@Module({
  imports: [
    ProjectsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
      }),
    }),
  ],
  providers: [PipelineGateway],
  exports: [PipelineGateway],
})
export class RealtimeModule {}
