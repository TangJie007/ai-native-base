import { Global, Module } from '@nestjs/common'
import { PipelineGateway } from './pipeline.gateway'

/**
 * 全局实时推送模块：任何业务模块都可注入 PipelineGateway 发事件，
 * 避免 pipeline / traces / sandbox 之间互相 import 造成循环依赖。
 */
@Global()
@Module({
  providers: [PipelineGateway],
  exports: [PipelineGateway],
})
export class RealtimeModule {}
