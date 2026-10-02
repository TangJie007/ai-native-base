import { Global, Logger, Module } from '@nestjs/common'
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
        if (provider !== 'mock') {
          // e2b / docker 尚未实现，回退到 mock，但必须显式告警避免误以为已生效
          new Logger('SandboxModule').warn(
            `SANDBOX_PROVIDER=${provider} 尚未实现，已回退到 mock 沙箱（不会执行真实隔离环境）`,
          )
        }
        return new MockSandboxProvider()
      },
    },
    SandboxService,
  ],
  exports: [SandboxService],
})
export class SandboxModule {}
