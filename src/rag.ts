import Database from 'better-sqlite3-multiple-ciphers'
import { SqliteHybrid } from 'sqlite-hybrid'
import { Embedder } from 'hf-embedder'
import { RAGModelError } from './errors.js'
import type { EmbeddingOptions, RAGProvider, SearchMode } from './types.js'

export class RagManager implements RAGProvider {
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

  ensureHybrid(): void {
    if (this.hybridReady) return

    if (!this.vectorSize) {
      this.loadEmbedder()
      this.vectorSize = this.embedder.embedSync('test').length
    }

    this.hybrid = new SqliteHybrid(this.db, {
      vectorSize: this.vectorSize,
      onEmbed: (content: string | string[]) => {
        if (!this.embedder) this.loadEmbedder()
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
    this.hybrid!.createVectorIndex(table, extractExpr)
    this.hybrid!.createFTS5(table, extractExpr)
  }

  search<T>(table: string, query: string, limit: number, mode: SearchMode = 'hybrid'): T[] {
    this.ensureHybrid()

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

    return this.fuseResults(vecResults, keyResults, limit) as unknown as T[]
  }

  private fuseResults(
    vecResults: Record<string, unknown>[],
    keyResults: Record<string, unknown>[],
    limit: number,
  ) {
    const k = 60

    const vecMap = new Map<string, { rank: number; similarity: number; record: Record<string, unknown> }>()
    vecResults.forEach((r, i) => {
      const id = r._id as string
      if (id != null && !vecMap.has(id)) {
        vecMap.set(id, {
          rank: i + 1,
          similarity: Math.max(0, 1 - (r._score as number)),
          record: r,
        })
      }
    })

    const keyMap = new Map<string, { rank: number; record: Record<string, unknown> }>()
    keyResults.forEach((r, i) => {
      const id = r._id as string
      if (id != null && !keyMap.has(id)) {
        keyMap.set(id, { rank: i + 1, record: r })
      }
    })

    const fused = new Map<string, { rrfScore: number; similarity: number; record: Record<string, unknown> }>()

    for (const [id, v] of vecMap) {
      const keyRank = keyMap.get(id)?.rank ?? 0
      const rrfScore = 1 / (k + v.rank) + (keyRank > 0 ? 1 / (k + keyRank) : 0)
      fused.set(id, { rrfScore, similarity: v.similarity, record: v.record })
    }

    for (const [id, kEntry] of keyMap) {
      if (!vecMap.has(id)) {
        fused.set(id, { rrfScore: 1 / (k + kEntry.rank), similarity: 0, record: kEntry.record })
      }
    }

    return [...fused.values()]
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, limit)
      .map(item => ({
        ...item.record,
        _score: item.similarity,
      }))
  }

  globalSearch<T>(query: string, limit: number, mode?: SearchMode): T[] {
    this.ensureHybrid()

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
