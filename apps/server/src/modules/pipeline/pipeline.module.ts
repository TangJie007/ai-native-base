import { Module } from '@nestjs/common'
import { AssumptionsModule } from '../assumptions/assumptions.module'
import { ContractsModule } from '../contracts/contracts.module'
import { DependenciesModule } from '../dependencies/dependencies.module'
import { ProjectsModule } from '../projects/projects.module'
import { TracesModule } from '../traces/traces.module'
import { PipelineController } from './pipeline.controller'
import { PipelineService } from './pipeline.service'

@Module({
  imports: [
    ProjectsModule,
    AssumptionsModule,
    ContractsModule,
    DependenciesModule,
    TracesModule,
  ],
  controllers: [PipelineController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
