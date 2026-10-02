import { Module } from '@nestjs/common'
import { ContractsModule } from '../contracts/contracts.module'
import { ProjectsModule } from '../projects/projects.module'
import { TracesModule } from '../traces/traces.module'
import { DependenciesController } from './dependencies.controller'
import { DependenciesService } from './dependencies.service'

@Module({
  imports: [ProjectsModule, ContractsModule, TracesModule],
  controllers: [DependenciesController],
  providers: [DependenciesService],
  exports: [DependenciesService],
})
export class DependenciesModule {}
