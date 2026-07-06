import Database from 'better-sqlite3-multiple-ciphers'
import { SqliteHybrid } from 'sqlite-hybrid'
import { Embedder } from 'hf-embedder'
import { RAGModelError, RAGNotConfiguredError } from './errors.js'
import { fuseResults } from './rrf.js'
import type { EmbeddingOptions, SearchMode } from './types.js'

export class RagManager {
  private hybrid: SqliteHybrid | null = null
  private embedder: any = null
  private hybridReady = false
  private vectorSize: number

  constructor(
    private db: Database.Database,
    private options: EmbeddingOptions | undefined,
  ) {
    this.vectorSize = options?.vectorSize || 0
  }

  static readMeta(db: Database.Database): EmbeddingOptions | null {
    try {
      const row = db.prepare('SELECT config FROM _anigodb_meta WHERE id = 1').get() as { config: string } | undefined
      if (!row) return null
      const meta = JSON.parse(row.config).embedding as EmbeddingOptions
      if (!meta.model) return null
      return meta
    } catch {
      return null
    }
  }

  private saveMeta(): void {
    const config: Record<string, unknown> = {}
    if (this.options?.model) config.model = this.options.model
    if (this.options?.dtype) config.dtype = this.options.dtype
    if (this.options?.device) config.device = this.options.device
    if (this.options?.pooling) config.pooling = this.options.pooling
    config.vectorSize = this.vectorSize

    this.db.exec(`CREATE TABLE IF NOT EXISTS _anigodb_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      config TEXT NOT NULL
    )`)
    this.db.prepare(`INSERT OR REPLACE INTO _anigodb_meta (id, config) VALUES (1, ?)`)
      .run(JSON.stringify({ embedding: config }))
  }

  ensureHybrid(): void {
    if (this.hybridReady) return

    if (this.options?.model) {
      if (!this.embedder) this.loadEmbedder()
      if (!this.vectorSize) {
        this.vectorSize = this.embedder.embedSync('test').length
      }
    }

    this.hybrid = new SqliteHybrid(this.db, {
      vectorSize: this.vectorSize || 1,
      onEmbed: (content: string | string[]) => {
        if (!this.embedder) {
          if (!this.options?.model) throw new RAGNotConfiguredError('Vector search requires an embedding model')
          this.loadEmbedder()
        }
        if (Array.isArray(content)) return this.embedder!.embedSync(content)
        return this.embedder!.embedSync(content)
      },
    })

    this.hybridReady = true
  }

  private loadEmbedder(): void {
    const opts: Record<string, unknown> = {}
    if (this.options?.model) opts.model = this.options.model
    if (this.options?.dtype) opts.dtype = this.options.dtype
    if (this.options?.device) opts.device = this.options.device
    if (this.options?.pooling) opts.pooling = this.options.pooling

    try {
      this.embedder = Embedder.createSync(opts)
    } catch (err: unknown) {
      throw new RAGModelError(
        'Failed to initialize embedding model. Check network connectivity and disk space.',
        { cause: err },
      )
    }
  }

  createRAGIndex(table: string, field: string): void {
    this.ensureHybrid()
    const extractExpr = `json_extract(doc, '$.${field}')`
    if (this.embedder) {
      this.hybrid!.createVectorIndex(table, extractExpr)
      this.saveMeta()
    }
    this.hybrid!.createFTS5(table, extractExpr)
  }

  search<T>(table: string, query: string, limit: number, mode: SearchMode = 'hybrid'): T[] {
    this.ensureHybrid()

    if (!this.embedder) mode = 'keyword'

    if (mode === 'vector') {
      const results = this.hybrid!.vectorSearch<Record<string, unknown>>(table, query, limit)
      return results.map(r => ({
        ...r,
        _score: Math.max(0, 1 - (r._score as number)),
      })) as T[]
    }

    if (mode === 'keyword') {
      return this.hybrid!.keySearch<Record<string, unknown>>(table, query, limit) as T[]
    }

    const widerLimit = limit * 2
    const vecResults = this.hybrid!.vectorSearch<Record<string, unknown>>(table, query, widerLimit)
    const keyResults = this.hybrid!.keySearch<Record<string, unknown>>(table, query, widerLimit)

    return fuseResults(vecResults, keyResults, limit) as unknown as T[]
  }

  globalSearch<T>(query: string, limit: number, mode?: SearchMode): T[] {
    this.ensureHybrid()

    if (!this.embedder) mode = 'keyword'

    if (mode === 'vector') {
      const results = this.hybrid!.vectorSearch(query, limit)
      return results.map(r => ({
        ...r,
        _score: Math.max(0, 1 - (r._score as number)),
      })) as T[]
    }

    if (mode === 'keyword') {
      return this.hybrid!.keySearch(query, limit) as T[]
    }

    return this.hybrid!.hybridSearch(query, limit) as T[]
  }

  close(): void {
    this.embedder = null
    this.hybrid = null
    this.hybridReady = false
  }
}
