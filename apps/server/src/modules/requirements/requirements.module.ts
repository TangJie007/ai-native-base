import { Module } from '@nestjs/common'
import { ProjectsModule } from '../projects/projects.module'
import { TracesModule } from '../traces/traces.module'
import { RequirementsController } from './requirements.controller'
import { RequirementsService } from './requirements.service'

@Module({
  imports: [ProjectsModule, TracesModule],
  controllers: [RequirementsController],
  providers: [RequirementsService],
  exports: [RequirementsService],
})
export class RequirementsModule {}
