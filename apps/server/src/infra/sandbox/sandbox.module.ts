import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MockSandboxProvider } from './mock-sandbox.provider'
import { SandboxService } from './sandbox.service'
import { SANDBOX_PROVIDER, type SandboxProvider } from './sandbox.types'

/**
 * 沙箱适配器工厂：目前仅实现 mock，e2b/docker 留作后续接入点。
 */
@Global()
@Module({
  providers: [
    {
      provide: SANDBOX_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SandboxProvider => {
        const provider = config.get<string>('sandboxProvider') ?? 'mock'
        // e2b / docker 尚未实现，统一回退到 mock，保证流程可跑通
        void provider
        return new MockSandboxProvider()
      },
    },
    SandboxService,
  ],
  exports: [SandboxService],
})
export class SandboxModule {}
