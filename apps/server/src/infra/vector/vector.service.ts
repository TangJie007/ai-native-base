import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { EMBEDDING_DIM } from '@specforge/shared'
import { pseudoEmbedding } from '../../common/crypto.util'

interface SqliteStatement {
  run(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
}

interface SqliteDatabase {
  exec(sql: string): void
  prepare(sql: string): SqliteStatement
  close(): void
}

interface VectorRow {
  owner_type: string
  owner_id: string
  project_id: string | null
  text: string
  dim: number
  vector: Buffer
}

export interface VectorHit {
  ownerType: string
  ownerId: string
  projectId: string | null
  text: string
  score: number
}

/**
 * 逐字节读取小端双精度数组。SQLite BLOB 的 byteOffset 不保证 8 字节对齐，
 * 直接构造 Float64Array 视图会抛 RangeError，故手动解码规避对齐问题。
 */
function readDoubles(buffer: Buffer, length: number): number[] {
  const out = new Array<number>(length)
  for (let i = 0; i < length; i += 1) {
    out[i] = buffer.readDoubleLE(i * 8)
  }
  return out
}

/**
 * 向量检索（PRD 8.1）：独立 SQLite 库，使用 Node 内置 node:sqlite，零外部依赖。
 * 采用词袋哈希伪 embedding + 余弦相似度暴力检索，适合平台侧契约/代码片段召回；
 * 接入真实 embedding 服务时只需替换 pseudoEmbedding 并调整 dim。
 */
@Injectable()
export class VectorService implements OnModuleDestroy {
  private readonly logger = new Logger(VectorService.name)
  private db: SqliteDatabase | null = null
  private attempted = false
  private failedAt = 0
  private readonly dim = EMBEDDING_DIM
  /** 初始化失败后的重试间隔，避免高频重试与日志刷屏 */
  private static readonly RETRY_INTERVAL_MS = 30_000

  constructor(private readonly config: ConfigService) {}

  private database(): SqliteDatabase | null {
    if (this.db) return this.db
    // 失败后进入冷却期，冷却结束允许再次尝试（D-8）
    if (this.attempted && Date.now() - this.failedAt < VectorService.RETRY_INTERVAL_MS) return null
    this.attempted = true
    try {
      const require = createRequire(__filename)
      const sqlite = require('node:sqlite') as { DatabaseSync: new (path: string) => SqliteDatabase }
      const dbPath = resolve(process.cwd(), this.config.get<string>('vectorDbPath') ?? './data/vectors.db')
      mkdirSync(dirname(dbPath), { recursive: true })
      const db = new sqlite.DatabaseSync(dbPath)
      db.exec(`
        CREATE TABLE IF NOT EXISTS vector_embeddings (
          id TEXT PRIMARY KEY,
          owner_type TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          project_id TEXT,
          model TEXT NOT NULL,
          dim INTEGER NOT NULL,
          vector BLOB NOT NULL,
          text TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_vector_owner ON vector_embeddings(owner_type, owner_id);
        CREATE INDEX IF NOT EXISTS idx_vector_project ON vector_embeddings(project_id);
      `)
      this.db = db
      this.logger.log(`向量库已就绪：${dbPath}`)
    } catch (error) {
      this.db = null
      this.failedAt = Date.now()
      this.logger.warn(
        `向量库初始化失败（不影响主流程，${VectorService.RETRY_INTERVAL_MS / 1000}s 后重试）：${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
    return this.db
  }

  upsert(input: { ownerType: string; ownerId: string; projectId?: string | null; model: string; text: string }): void {
    const db = this.database()
    if (!db) return
    const id = `${input.ownerType}:${input.ownerId}`
    const vector = Buffer.from(new Float64Array(pseudoEmbedding(input.text, this.dim)).buffer)
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO vector_embeddings (id, owner_type, owner_id, project_id, model, dim, vector, text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET text = excluded.text, vector = excluded.vector, model = excluded.model`,
    ).run(
      id,
      input.ownerType,
      input.ownerId,
      input.projectId ?? null,
      input.model,
      this.dim,
      vector,
      input.text.slice(0, 8000),
      now,
    )
  }

  removeByOwner(ownerType: string, ownerId: string): void {
    const db = this.database()
    if (!db) return
    db.prepare('DELETE FROM vector_embeddings WHERE owner_type = ? AND owner_id = ?').run(ownerType, ownerId)
  }

  /** 删除项目下全部向量，项目删除时调用，避免残留脏召回（B-12） */
  removeByProject(projectId: string): void {
    const db = this.database()
    if (!db) return
    db.prepare('DELETE FROM vector_embeddings WHERE project_id = ?').run(projectId)
  }

  search(
    query: string,
    options: { projectId?: string; ownerType?: string; limit?: number } = {},
  ): VectorHit[] {
    const db = this.database()
    if (!db) return []
    const limit = options.limit ?? 5
    const conditions: string[] = []
    const params: unknown[] = []
    if (options.projectId) {
      conditions.push('project_id = ?')
      params.push(options.projectId)
    }
    if (options.ownerType) {
      conditions.push('owner_type = ?')
      params.push(options.ownerType)
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = db
      .prepare(`SELECT owner_type, owner_id, project_id, text, dim, vector FROM vector_embeddings ${where}`)
      .all(...params) as VectorRow[]

    const queryVector = pseudoEmbedding(query, this.dim)
    const hits: VectorHit[] = []
    for (const row of rows) {
      // 维度不一致或 BLOB 长度不足时跳过，避免读到脏数据（D-7）
      if (row.dim !== this.dim || row.vector.byteLength < row.dim * 8) continue
      const stored = readDoubles(row.vector, row.dim)
      hits.push({
        ownerType: row.owner_type,
        ownerId: row.owner_id,
        projectId: row.project_id,
        text: row.text,
        score: this.cosine(queryVector, stored),
      })
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  onModuleDestroy(): void {
    this.db?.close()
    this.db = null
  }

  /** 标准余弦相似度：点积 / (模长乘积)，任一向量为零向量时返回 0（D-7） */
  private cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
    const len = Math.min(a.length, b.length)
    let dot = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < len; i += 1) {
      dot += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    if (normA === 0 || normB === 0) return 0
    return Number((dot / (Math.sqrt(normA) * Math.sqrt(normB))).toFixed(4))
  }
}
