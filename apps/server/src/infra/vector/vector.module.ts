import { Global, Module } from '@nestjs/common'
import { VectorService } from './vector.service'

/**
 * 全局向量模块：S1/S2 落库后写入向量（SQLite），后续做相似片段召回。
 * 设为 @Global 让业务模块无需显式 import。
 */
@Global()
@Module({
  providers: [VectorService],
  exports: [VectorService],
})
export class VectorModule {}
