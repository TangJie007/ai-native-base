import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import type { Server, Socket } from 'socket.io'
import type { AgentTrace, PipelineStatus, RequirementItem, SandboxFile } from '@specforge/shared'
import { ProjectsService } from '../projects/projects.service'

interface WsJwtPayload {
  sub?: string
  email?: string
  name?: string
}

/**
 * 流水线实时推送（PRD 4.5）：S4/S5 执行期间把条目状态、轨迹、沙箱文件变化推给前端。
 *
 * 安全：连接阶段校验 handshake.auth.token（JWT），未通过立即断开；
 * 连接后必须 subscribe 到 `project:<projectId>` 房间（校验项目归属）才可能收到事件，
 * 所有推送仅发往对应项目房间，避免全局广播导致跨用户越权泄露。
 */
@WebSocketGateway({
  namespace: '/ws',
  cors: { origin: true, credentials: true },
})
export class PipelineGateway implements OnGatewayConnection {
  private readonly logger = new Logger(PipelineGateway.name)

  @WebSocketServer()
  server!: Server

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly projects: ProjectsService,
  ) {}

  /** 握手鉴权：无有效 token 直接断开，杜绝匿名连接 */
  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client)
    if (!token) {
      client.disconnect(true)
      return
    }
    try {
      const payload = await this.jwt.verifyAsync<WsJwtPayload>(token, {
        secret: this.config.get<string>('jwt.secret'),
      })
      if (!payload?.sub) throw new Error('missing subject')
      client.data.userId = payload.sub
    } catch (error) {
      this.logger.debug(`WebSocket 鉴权失败，断开连接：${(error as Error).message}`)
      client.disconnect(true)
    }
  }

  /** 订阅项目房间：校验项目归属后加入，切换项目时退出旧房间 */
  @SubscribeMessage('subscribe')
  async subscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { projectId?: string },
  ): Promise<{ ok: boolean; error?: string }> {
    const userId = client.data.userId as string | undefined
    const projectId = body?.projectId
    if (!userId || !projectId) return { ok: false, error: 'unauthorized' }

    try {
      await this.projects.assertOwned(userId, projectId)
    } catch {
      return { ok: false, error: 'forbidden' }
    }

    const target = `project:${projectId}`
    for (const room of client.rooms) {
      if (room.startsWith('project:') && room !== target) void client.leave(room)
    }
    await client.join(target)
    return { ok: true }
  }

  emitPipelineStatus(payload: PipelineStatus): void {
    this.room(payload.projectId)?.emit('pipeline:status', payload)
  }

  emitItemStatus(payload: RequirementItem): void {
    this.room(payload.projectId)?.emit('item:status', payload)
  }

  emitTrace(payload: AgentTrace): void {
    this.room(payload.projectId)?.emit('trace:new', payload)
  }

  emitSandboxFiles(projectId: string, payload: SandboxFile[]): void {
    this.logger.debug(`推送沙箱文件 ${projectId} ×${payload.length}`)
    this.room(projectId)?.emit('sandbox:files', { projectId, files: payload })
  }

  private room(projectId: string) {
    return this.server?.to(`project:${projectId}`)
  }

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth as { token?: string } | undefined
    if (auth?.token) return auth.token
    const header = client.handshake.headers.authorization
    if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7)
    return undefined
  }
}
