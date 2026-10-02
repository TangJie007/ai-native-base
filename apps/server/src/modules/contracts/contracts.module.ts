import { Module } from '@nestjs/common'
import { AssumptionsModule } from '../assumptions/assumptions.module'
import { ProjectsModule } from '../projects/projects.module'
import { TracesModule } from '../traces/traces.module'
import { ContractsController } from './contracts.controller'
import { ContractsService } from './contracts.service'

@Module({
  imports: [ProjectsModule, AssumptionsModule, TracesModule],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
