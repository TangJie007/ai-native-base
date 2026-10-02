import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { JwtAuthGuard } from './common/jwt-auth.guard'
import configuration from './config/configuration'
import { LlmModule } from './infra/llm/llm.module'
import { SandboxModule } from './infra/sandbox/sandbox.module'
import { VectorModule } from './infra/vector/vector.module'
import { AssumptionsModule } from './modules/assumptions/assumptions.module'
import { AuthModule } from './modules/auth/auth.module'
import { ContractsModule } from './modules/contracts/contracts.module'
import { DependenciesModule } from './modules/dependencies/dependencies.module'
import { PipelineModule } from './modules/pipeline/pipeline.module'
import { ProjectsModule } from './modules/projects/projects.module'
import { RealtimeModule } from './modules/realtime/realtime.module'
import { RequirementsModule } from './modules/requirements/requirements.module'
import { SandboxHttpModule } from './modules/sandbox/sandbox.module'
import { SettingsModule } from './modules/settings/settings.module'
import { TracesModule } from './modules/traces/traces.module'
import { PrismaModule } from './prisma/prisma.module'

@Module({
  imports: [
    // 全局配置（含默认值）
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    // 基础设施（均为 @Global）：数据库 / 模型适配器 / 沙箱适配器 / 向量库 / 实时推送
    PrismaModule,
    LlmModule,
    SandboxModule,
    VectorModule,
    RealtimeModule,
    // 业务模块
    AuthModule,
    ProjectsModule,
    TracesModule,
    RequirementsModule,
    AssumptionsModule,
    ContractsModule,
    DependenciesModule,
    PipelineModule,
    SettingsModule,
    SandboxHttpModule,
  ],
  providers: [
    // 默认全局鉴权：除 @Public() 外一律要求 Bearer JWT
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
