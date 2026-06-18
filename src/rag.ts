import Database from 'better-sqlite3-multiple-ciphers'
import { SqliteHybrid } from 'sqlite-hybrid'
import { Embedder } from 'hf-embedder'
import { RAGModelError } from './errors.js'
import type { EmbeddingOptions } from './types.js'

export class RagManager {
  private hybrid: SqliteHybrid | null = null
  private embedder: any = null
  private initialized = false
  private vectorSize: number

  constructor(
    private db: Database.Database,
    private options: EmbeddingOptions | undefined,
  ) {
    this.vectorSize = options?.vectorSize || 0
  }

  private ensureInitialized(): void {
    if (this.initialized) return

    try {
      const opts: Record<string, unknown> = {}
      if (this.options?.model) opts.model = this.options.model
      if (this.options?.dtype) opts.dtype = this.options.dtype
      if (this.options?.device) opts.device = this.options.device
      if (this.options?.pooling) opts.pooling = this.options.pooling

      this.embedder = Embedder.createSync(opts)

      if (!this.vectorSize) {
        const testVec = this.embedder.embedSync('test')
        this.vectorSize = testVec.length
      }

      this.hybrid = new SqliteHybrid(this.db, {
        vectorSize: this.vectorSize,
        onEmbed: (text: string) => this.embedder!.embedSync(text),
      })

      this.initialized = true
    } catch (err: unknown) {
      throw new RAGModelError(
        'Failed to initialize embedding model. Check network connectivity and disk space.',
        { cause: err },
      )
    }
  }

  createRAGIndex(table: string, field: string): void {
    this.ensureInitialized()
    const extractExpr = `json_extract(doc, '$.${field}')`
    this.hybrid!.createVectorIndex(table, extractExpr)
    this.hybrid!.createFTS5(table, extractExpr)
  }

  search<T>(table: string, query: string, limit: number): T[] {
    this.ensureInitialized()
    const results = this.hybrid!.hybridSearch(table, query, limit) as T[]
    return results
  }

  globalSearch<T>(query: string, limit: number): T[] {
    this.ensureInitialized()
    const results = this.hybrid!.hybridSearch(query, limit) as T[]
    return results
  }
}
