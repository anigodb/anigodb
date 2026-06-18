import Database from 'better-sqlite3-multiple-ciphers'
import { Collection } from './collection.js'
import { InvalidPathError } from './errors.js'
import { generateObjectId } from './object-id.js'
import { RagManager } from './rag.js'
import type { AnigoDBOptions } from './types.js'

export class AnigoDB {
  private db: Database.Database
  private collections = new Map<string, Collection<any>>()
  private objectIdFn: () => string
  private _rag: RagManager | null = null

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
  }

  getRagManager(): RagManager {
    if (!this._rag) {
      this._rag = new RagManager(this.db, this.options.embedding)
    }
    return this._rag
  }

  collection<T extends Record<string, unknown> = Record<string, unknown>>(name: string): Collection<T> {
    let col = this.collections.get(name) as Collection<T> | undefined
    if (!col) {
      col = new Collection<T>(name, this.db, this.objectIdFn, this)
      this.collections.set(name, col)
    }
    return col
  }

  transaction<T>(fn: () => T): T {
    const control = this.db.transaction(fn)
    return control()
  }

  search<T = any>(query: string, options?: { limit?: number }): T[] {
    const rows = this.getRagManager().globalSearch<Record<string, unknown>>(query, options?.limit || 10)
    return rows.map(r => {
      const doc = typeof r.doc === 'string' ? JSON.parse(r.doc) : {}
      delete r.doc
      return { ...r, ...doc } as T
    })
  }

  close(): void {
    this.db.close()
  }

  get raw(): Database.Database | undefined {
    return undefined
  }
}
