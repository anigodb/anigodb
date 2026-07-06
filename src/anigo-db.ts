import Database from 'better-sqlite3-multiple-ciphers'
import { Collection } from './collection.js'
import { InvalidPathError } from './errors.js'
import { generateObjectId } from './object-id.js'
import { RagManager } from './rag.js'
import type { AnigoDBOptions, SearchMode } from './types.js'

export class AnigoDB {
  private db: Database.Database
  private collections = new Map<string, Collection<any>>()
  private objectIdFn: () => string
  private _rag: RagManager | undefined = undefined

  static connect(options: AnigoDBOptions): AnigoDB {
    if (options.path === ':memory:') {
      throw new InvalidPathError("':memory:' is not supported. AnigoDB requires a file path. Use a temporary file path for testing.")
    }

    return new AnigoDB(options)
  }

  private constructor(private options: AnigoDBOptions) {
    this.db = new Database(options.path)
    this.objectIdFn = options.objectId || generateObjectId

    if (options.key) {
      if (options.cipher) {
        this.db.pragma(`cipher = '${options.cipher}'`)
      }
      this.db.pragma(`key = '${options.key}'`)
      if (options.kdfIter) {
        this.db.pragma(`kdf_iter = ${options.kdfIter}`)
      }
    }

    const wal = options.wal !== false
    if (wal) this.db.pragma('journal_mode = WAL')

    this.db.pragma(`busy_timeout = ${options.busyTimeout || 5000}`)
    this.db.pragma(`synchronous = ${options.synchronous || 'NORMAL'}`)
    this.db.pragma(`cache_size = ${options.cacheSize ? -options.cacheSize : -64000}`)

    this.db.function('regexp', (pattern: unknown, value: unknown) => {
      return new RegExp(pattern as string).test(value as string) ? 1 : 0
    })

    if (this.hasExistingRAGIndexes()) {
      const savedMeta = RagManager.readMeta(this.db)
      if (savedMeta) {
        this._rag = new RagManager(this.db, savedMeta)
        this._rag.ensureHybrid()
      }
    }
  }

  private hasExistingRAGIndexes(): boolean {
    try {
      const row = this.db.prepare(
        `SELECT COUNT(*) AS count FROM _sqlite_hybrid_indexes WHERE has_vector = 1`
      ).get() as { count: number }
      return row.count > 0
    } catch {
      return false
    }
  }

  getRagManager(): RagManager {
    if (this._rag === undefined) {
      const userConfig = this.options.embedding
      const savedMeta = RagManager.readMeta(this.db)
      if (savedMeta) {
        this._rag = new RagManager(this.db, savedMeta)
      } else if (userConfig?.model) {
        this._rag = new RagManager(this.db, userConfig)
      } else {
        this._rag = new RagManager(this.db, undefined)
      }
    }
    return this._rag
  }

  collection<T extends Record<string, unknown> = Record<string, unknown>>(name: string): Collection<T> {
    let col = this.collections.get(name) as Collection<T> | undefined
    if (!col) {
      col = new Collection<T>(name, this.db, this.objectIdFn, this.getRagManager())
      this.collections.set(name, col)
    }
    return col
  }

  transaction<T>(fn: () => T): T {
    const control = this.db.transaction(fn)
    return control()
  }

  search<T>(table: string, query: string, limit: number, mode?: SearchMode): T[]
  search<T = any>(query: string, options?: { limit?: number; mode?: SearchMode }): T[]
  search<T>(tableOrQuery: string, queryOrOptions?: string | { limit?: number; mode?: SearchMode }, limit?: number, mode?: SearchMode): T[] {
    if (typeof queryOrOptions === 'string') {
      return this.getRagManager().search<T>(tableOrQuery, queryOrOptions, limit ?? 10, mode)
    }
    const rows = this.getRagManager().globalSearch<Record<string, unknown>>(tableOrQuery, queryOrOptions?.limit || 10, queryOrOptions?.mode)
    return rows.map(r => {
      const doc = typeof r.doc === 'string' ? JSON.parse(r.doc) : {}
      delete r.doc
      return { _collection: r._table, ...r, ...doc } as T
    })
  }

  createRAGIndex(table: string, field: string): void {
    this.getRagManager().createRAGIndex(table, field)
  }

  close(): void {
    if (this._rag) this._rag.close()
    this.db.close()
  }
}
