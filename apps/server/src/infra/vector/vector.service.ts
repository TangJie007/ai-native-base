import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
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
 * 向量检索（PRD 8.1）：独立 SQLite 库，使用 Node 内置 node:sqlite，零外部依赖。
 * 采用词袋哈希伪 embedding + 余弦相似度暴力检索，适合平台侧契约/代码片段召回；
 * 接入真实 embedding 服务时只需替换 pseudoEmbedding 并调整 dim。
 */
@Injectable()
export class VectorService implements OnModuleDestroy {
  private readonly logger = new Logger(VectorService.name)
  private db: SqliteDatabase | null = null
  private initialized = false
  private readonly dim = 64

  constructor(private readonly config: ConfigService) {}

  private database(): SqliteDatabase | null {
    if (this.initialized) return this.db
    this.initialized = true
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
      this.logger.warn(
        `向量库初始化失败（不影响主流程）：${error instanceof Error ? error.message : String(error)}`,
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
    const rows = db.prepare(`SELECT owner_type, owner_id, project_id, text, vector FROM vector_embeddings ${where}`).all(
      ...params,
    ) as VectorRow[]

    const queryVector = pseudoEmbedding(query, this.dim)
    return rows
      .map((row) => ({
        ownerType: row.owner_type,
        ownerId: row.owner_id,
        projectId: row.project_id,
        text: row.text,
        score: this.cosine(queryVector, new Float64Array(row.vector.buffer, row.vector.byteOffset, this.dim)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  onModuleDestroy(): void {
    this.db?.close()
    this.db = null
  }

  private cosine(a: number[] | Float64Array, b: Float64Array): number {
    let dot = 0
    for (let i = 0; i < this.dim; i += 1) dot += a[i] * b[i]
    return Number(dot.toFixed(4))
  }
}
