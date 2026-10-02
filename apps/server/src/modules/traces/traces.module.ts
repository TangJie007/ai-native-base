import { Module } from '@nestjs/common'
import { ProjectsModule } from '../projects/projects.module'
import { TraceService } from './trace.service'
import { TracesController } from './traces.controller'
import { TracesService } from './traces.service'

@Module({
  imports: [ProjectsModule],
  controllers: [TracesController],
  providers: [TraceService, TracesService],
  exports: [TraceService, TracesService],
})
export class TracesModule {}
