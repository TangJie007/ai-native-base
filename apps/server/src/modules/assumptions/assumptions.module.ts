import { Module } from '@nestjs/common'
import { ProjectsModule } from '../projects/projects.module'
import { AssumptionsController } from './assumptions.controller'
import { AssumptionsService } from './assumptions.service'

@Module({
  imports: [ProjectsModule],
  controllers: [AssumptionsController],
  providers: [AssumptionsService],
  exports: [AssumptionsService],
})
export class AssumptionsModule {}
