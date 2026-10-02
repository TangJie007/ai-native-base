import { Module } from '@nestjs/common'
import { ProjectsModule } from '../projects/projects.module'
import { SandboxController } from './sandbox.controller'

/**
 * 沙箱 HTTP 视图模块（与 infra 层的全局 SandboxModule 区分命名）。
 * SandboxService 由全局 SandboxModule 提供，这里只挂载控制器。
 */
@Module({
  imports: [ProjectsModule],
  controllers: [SandboxController],
})
export class SandboxHttpModule {}
