import { Logger } from '@nestjs/common'
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import type { Server } from 'socket.io'
import type { AgentTrace, PipelineStatus, RequirementItem, SandboxFile } from '@specforge/shared'

/**
 * 流水线实时推送（PRD 4.5）：S4/S5 执行期间把条目状态、轨迹、沙箱文件变化推给前端。
 * 事件名与前端 Pipeline.vue 的订阅一一对应；前端按 payload.projectId 自行过滤。
 */
@WebSocketGateway({
  namespace: '/ws',
  cors: { origin: true, credentials: true },
})
export class PipelineGateway {
  private readonly logger = new Logger(PipelineGateway.name)

  @WebSocketServer()
  server!: Server

  emitPipelineStatus(payload: PipelineStatus): void {
    this.server?.emit('pipeline:status', payload)
  }

  emitItemStatus(payload: RequirementItem): void {
    this.server?.emit('item:status', payload)
  }

  emitTrace(payload: AgentTrace): void {
    this.server?.emit('trace:new', payload)
  }

  emitSandboxFiles(projectId: string, payload: SandboxFile[]): void {
    this.logger.debug(`推送沙箱文件 ${projectId} ×${payload.length}`)
    this.server?.emit('sandbox:files', payload)
  }
}
