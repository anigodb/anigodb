import Database from 'better-sqlite3-multiple-ciphers'
import { compileQuery } from './query.js'
import { compileUpdate, buildUpdateSQL } from './update.js'
import { generateObjectId } from './object-id.js'
import { DuplicateKeyError, AnigoError } from './errors.js'
import type { AnigoDB } from './anigo-db.js'
import type {
  OptionalId,
  InsertOneResult,
  InsertManyResult,
  UpdateResult,
  DeleteResult,
  FindOneOptions,
  FindOptions,
  UpdateOptions,
  FindOneAndUpdateOptions,
  FindOneAndDeleteOptions,
  FindOneAndReplaceOptions,
  SearchOptions,
  SearchResult,
  Stage,
  IndexSpec,
  Sort,
  Filter,
} from './types.js'

export class Collection<T extends Record<string, unknown> = Record<string, unknown>> {
  private tableCreated = false
  private objectIdFn: () => string

  constructor(
    public readonly collectionName: string,
    private db: Database.Database,
    objectIdFn?: () => string,
    private anigoDb?: AnigoDB,
  ) {
    this.objectIdFn = objectIdFn || generateObjectId
  }

  private get ragManager() {
    return this.anigoDb?.getRagManager() ?? null
  }

  private ensureTable(): void {
    if (this.tableCreated) return
    this.db.exec(`CREATE TABLE IF NOT EXISTS ${this.escapeId(this.collectionName)} (
      _id TEXT NOT NULL UNIQUE,
      doc TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`)
    this.tableCreated = true
  }

  private escapeId(id: string): string {
    return `"${id}"`
  }

  private serialize(doc: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(doc)) {
      if (value === undefined) continue
      if (value instanceof Buffer) throw new TypeError(`Unsupported type 'Buffer'. AnigoDB only supports JSON-serializable types.`)
      if (typeof value === 'function') throw new TypeError(`Unsupported type 'function'. AnigoDB only supports JSON-serializable types.`)
      if (typeof value === 'symbol') throw new TypeError(`Unsupported type 'Symbol'. AnigoDB only supports JSON-serializable types.`)
      if (value instanceof Date) {
        result[key] = value.toISOString()
      } else {
        result[key] = value
      }
    }
    return result
  }

  private docToRow(doc: Record<string, unknown>): { _id: string; doc: string; created_at: string; updated_at: string } {
    const now = new Date().toISOString()
    const serialized = this.serialize(doc)
    const _id = (serialized._id as string) || this.objectIdFn()
    delete serialized._id
    return {
      _id,
      doc: JSON.stringify(serialized),
      created_at: now,
      updated_at: now,
    }
  }

  rowToDoc(row: { _id: string; doc: string; created_at: string; updated_at: string }): T {
    return { _id: row._id, ...JSON.parse(row.doc) } as T
  }

  private transaction(fn: () => any): any {
    return this.db.transaction(fn as any)()
  }

  insertOne(doc: OptionalId<T>): InsertOneResult {
    this.ensureTable()
    const row = this.docToRow(doc as Record<string, unknown>)
    try {
      this.db.prepare(`INSERT INTO ${this.escapeId(this.collectionName)} (_id, doc, created_at, updated_at) VALUES (?, ?, ?, ?)`)
        .run(row._id, row.doc, row.created_at, row.updated_at)
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint')) {
        throw new DuplicateKeyError(`_id '${row._id}' already exists in collection '${this.collectionName}'`)
      }
      throw err
    }
    return { acknowledged: true, insertedId: row._id }
  }

  insertMany(docs: OptionalId<T>[]): InsertManyResult {
    this.ensureTable()
    const insertedIds: string[] = []

    this.transaction(() => {
      for (const doc of docs) {
        const result = this.insertOne(doc)
        insertedIds.push(result.insertedId)
      }
    })

    return { acknowledged: true, insertedIds }
  }

  private buildWhere(filter: Record<string, unknown>): { where: string; params: unknown[] } {
    if (!filter || Object.keys(filter).length === 0) {
      return { where: '', params: [] }
    }
    const compiled = compileQuery(filter)
    return { where: `WHERE ${compiled.sql}`, params: compiled.params }
  }

  findOne(filter: Filter<T>, options?: FindOneOptions): T | null {
    this.ensureTable()
    const { where, params } = this.buildWhere(filter as Record<string, unknown>)
    let sql = `SELECT _id, doc, created_at, updated_at FROM ${this.escapeId(this.collectionName)} ${where}`

    if (options?.sort) {
      sql += ` ORDER BY ${this.buildSort(options.sort)}`
    }

    sql += ' LIMIT 1'
    const row = this.db.prepare(sql).get(...params) as { _id: string; doc: string; created_at: string; updated_at: string } | undefined
    return row ? this.rowToDoc(row) : null
  }

  find(filter: Filter<T>, options?: FindOptions): T[] {
    this.ensureTable()
    const { where, params } = this.buildWhere(filter as Record<string, unknown>)
    let sql = `SELECT _id, doc, created_at, updated_at FROM ${this.escapeId(this.collectionName)} ${where}`

    if (options?.sort) {
      sql += ` ORDER BY ${this.buildSort(options.sort)}`
    }
    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`
    }
    if (options?.skip) {
      sql += ` OFFSET ${options.skip}`
    }

    const rows = this.db.prepare(sql).all(...params) as { _id: string; doc: string; created_at: string; updated_at: string }[]
    return rows.map(r => this.rowToDoc(r))
  }

  private buildSort(sort: Sort): string {
    return Object.entries(sort)
      .map(([field, dir]) => {
        if (field === '_id') return `_id ${dir === -1 ? 'DESC' : 'ASC'}`
        return `json_extract(doc, '$.${field}') ${dir === -1 ? 'DESC' : 'ASC'}`
      })
      .join(', ')
  }

  updateOne(filter: Filter<T>, update: Record<string, unknown>, options?: UpdateOptions): UpdateResult {
    this.ensureTable()
    const compiled = compileUpdate(update)
    let created = false
    const id: string | null = this.transaction(() => {
      const doc = this.findOne(filter)
      if (!doc) {
        if (options?.upsert) {
          created = true
          const filterDoc = { ...filter as Record<string, unknown> }
          const insertDoc = this.applyUpdateToDoc(filterDoc, update)
          const result = this.insertOne(insertDoc as OptionalId<T>)
          return result.insertedId
        }
        return null
      }

      this.applyPushPull(doc, compiled.pushPull)
      const updateSql = buildUpdateSQL(compiled)

      if (updateSql) {
        const now = new Date().toISOString()
        const allParams = [...compiled.params, now, doc._id]
        this.db.prepare(`UPDATE ${this.escapeId(this.collectionName)} SET doc = ${updateSql}, updated_at = ? WHERE _id = ?`)
          .run(...allParams)
      }

      return doc._id
    })

    if (id === null) {
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: null }
    }

    return { acknowledged: true, matchedCount: created ? 0 : 1, modifiedCount: 1, upsertedId: created ? id : null }
  }

  updateMany(filter: Filter<T>, update: Record<string, unknown>): UpdateResult {
    this.ensureTable()
    const compiled = compileUpdate(update)

    const { modifiedCount } = this.transaction(() => {
      const docs = this.find(filter)
      let modified = 0

      for (const doc of docs) {
        this.applyPushPull(doc, compiled.pushPull)
        const updateSql = buildUpdateSQL(compiled)

        if (!updateSql) continue

        const now = new Date().toISOString()
        const allParams = [...compiled.params, now, doc._id]
        this.db.prepare(`UPDATE ${this.escapeId(this.collectionName)} SET doc = ${updateSql}, updated_at = ? WHERE _id = ?`)
          .run(...allParams)
        modified++
      }

      return { matchedCount: modified, modifiedCount: modified }
    })

    return { acknowledged: true, matchedCount: modifiedCount, modifiedCount, upsertedId: null }
  }

  deleteOne(filter: Filter<T>): DeleteResult {
    this.ensureTable()
    const { where, params } = this.buildWhere(filter as Record<string, unknown>)
    const result = this.db.prepare(`DELETE FROM ${this.escapeId(this.collectionName)} ${where} LIMIT 1`).run(...params)
    return { acknowledged: true, deletedCount: Number(result.changes) }
  }

  deleteMany(filter: Filter<T>): DeleteResult {
    this.ensureTable()
    const { where, params } = this.buildWhere(filter as Record<string, unknown>)
    const result = this.db.prepare(`DELETE FROM ${this.escapeId(this.collectionName)} ${where}`).run(...params)
    return { acknowledged: true, deletedCount: Number(result.changes) }
  }

  countDocuments(filter: Filter<T>): number {
    this.ensureTable()
    const { where, params } = this.buildWhere(filter as Record<string, unknown>)
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM ${this.escapeId(this.collectionName)} ${where}`).get(...params) as { count: number }
    return row.count
  }

  findOneAndUpdate(filter: Filter<T>, update: Record<string, unknown>, options?: FindOneAndUpdateOptions): T | null {
    this.ensureTable()
    return this.transaction(() => {
      if (options?.returnDocument === 'after') {
      const doc = this.findOne(filter, options?.sort ? { sort: options.sort } : undefined)
        if (!doc) return null
        const compiled = compileUpdate(update)
        const docData = this.applyPushPull(doc, compiled.pushPull)
        const updateSql = buildUpdateSQL(compiled)
        if (updateSql) {
          const now = new Date().toISOString()
          this.db.prepare(`UPDATE ${this.escapeId(this.collectionName)} SET doc = ${updateSql}, updated_at = ? WHERE _id = ?`)
            .run(...compiled.params, now, doc._id)
        }
        return this.findOne({ _id: doc._id } as Filter<T>)
      }

      const doc = this.findOne(filter, options?.sort ? { sort: options.sort } : undefined)
      if (!doc) return null
      const compiled = compileUpdate(update)
      const docData = this.applyPushPull(doc, compiled.pushPull)
      const updateSql = buildUpdateSQL(compiled)
      if (updateSql) {
        const now = new Date().toISOString()
        this.db.prepare(`UPDATE ${this.escapeId(this.collectionName)} SET doc = ${updateSql}, updated_at = ? WHERE _id = ?`)
          .run(...compiled.params, now, doc._id)
      }
      return doc
    })
  }

  findOneAndDelete(filter: Filter<T>, options?: FindOneAndDeleteOptions): T | null {
    this.ensureTable()
    return this.transaction(() => {
      const doc = this.findOne(filter, options?.sort ? { sort: options.sort } : undefined)
      if (!doc) return null
      const { where, params } = this.buildWhere({ _id: doc._id } as Record<string, unknown>)
      this.db.prepare(`DELETE FROM ${this.escapeId(this.collectionName)} ${where}`).run(...params)
      return doc
    })
  }

  findOneAndReplace(filter: Filter<T>, replacement: T, options?: FindOneAndReplaceOptions): T | null {
    this.ensureTable()
    return this.transaction(() => {
      const doc = this.findOne(filter, options?.sort ? { sort: options.sort } : undefined)
      if (!doc) return null
      const now = new Date().toISOString()
      const serialized = this.serialize(replacement as Record<string, unknown>)
      delete serialized._id
      this.db.prepare(`UPDATE ${this.escapeId(this.collectionName)} SET doc = ?, updated_at = ? WHERE _id = ?`)
        .run(JSON.stringify(serialized), now, doc._id)
      if (options?.returnDocument === 'after') {
        return this.findOne({ _id: doc._id } as Filter<T>)
      }
      return doc
    })
  }

  createIndex(spec: IndexSpec): string {
    this.ensureTable()
    const fields = Object.keys(spec)
    const name = `idx_${this.collectionName}_${fields.join('_')}`
    const cols = fields.map(f => {
      if (f === '_id') return `_id`
      return `json_extract(doc, '$.${f}')`
    }).join(', ')
    this.db.exec(`CREATE INDEX IF NOT EXISTS ${this.escapeId(name)} ON ${this.escapeId(this.collectionName)}(${cols})`)
    return name
  }

  dropIndex(name: string): void {
    this.db.exec(`DROP INDEX IF EXISTS ${this.escapeId(name)}`)
  }

  aggregate<T = any>(pipeline: Stage[]): T[] {
    this.ensureTable()
    let sql = `SELECT * FROM ${this.escapeId(this.collectionName)}`
    const params: unknown[] = []

    for (const stage of pipeline) {
      if ('$match' in stage) {
        const compiled = compileQuery(stage.$match)
        sql = `SELECT * FROM (${sql}) WHERE ${compiled.sql}`
        params.push(...compiled.params)
      } else if ('$sort' in stage) {
        sql = `SELECT * FROM (${sql}) ORDER BY ${this.buildSort(stage.$sort)}`
      } else if ('$skip' in stage) {
        sql = `SELECT * FROM (${sql}) LIMIT -1 OFFSET ${stage.$skip}`
      } else if ('$limit' in stage) {
        sql = `SELECT * FROM (${sql}) LIMIT ${stage.$limit}`
      } else if ('$count' in stage) {
        sql = `SELECT COUNT(*) AS ${this.escapeId(stage.$count)} FROM (${sql})`
      }
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[]
    return rows.map(r => {
      if (r._id && r.doc) {
        return this.rowToDoc(r as any) as unknown as T
      }
      return r as T
    })
  }

  private applyPushPull(doc: T, pushPull: Array<{ field: string; value: unknown; operator: 'push' | 'pull' }>): T {
    if (pushPull.length === 0) return doc

    const data = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>
    for (const pp of pushPull) {
      const arr = (data[pp.field] as unknown[]) || []
      if (pp.operator === 'push') {
        arr.push(pp.value)
        data[pp.field] = arr
      } else {
        data[pp.field] = arr.filter(item => item !== pp.value)
      }
    }

    const now = new Date().toISOString()
    const serialized = this.serialize(data)
    delete serialized._id
    this.db.prepare(`UPDATE ${this.escapeId(this.collectionName)} SET doc = ?, updated_at = ? WHERE _id = ?`)
      .run(JSON.stringify(serialized), now, doc._id)

    return data as T
  }

  private applyUpdateToDoc(doc: Record<string, unknown>, update: Record<string, unknown>): Record<string, unknown> {
    const result = { ...doc }
    const compiled = compileUpdate(update)

    for (const pp of compiled.pushPull) {
      if (pp.operator === 'push') {
        const arr = (result[pp.field] as unknown[]) || []
        arr.push(pp.value)
        result[pp.field] = arr
      } else {
        const arr = (result[pp.field] as unknown[]) || []
        result[pp.field] = arr.filter(item => item !== pp.value)
      }
    }

    for (const path of compiled.removePaths) {
      const field = path.replace('$.', '')
      delete result[field]
    }

    for (let i = 0; i < compiled.setExprs.length; i++) {
      const expr = compiled.setExprs[i]
      const match = expr.match(/'\$\.(.+?)', \?/)
      if (match) {
        result[match[1]] = compiled.params[i]
      }
    }

    return result
  }

  createRAGIndex(field: string): void {
    this.ensureTable()
    this.ragManager?.createRAGIndex(this.collectionName, field)
  }

  search(query: string, options?: SearchOptions): SearchResult<T>[] {
    this.ensureTable()
    if (!this.ragManager) return []
    const limit = options?.limit || 10
    const rows = this.ragManager.search<Record<string, unknown>>(this.collectionName, query, limit)
    return rows.map(r => {
      const doc = typeof r.doc === 'string' ? JSON.parse(r.doc) : {}
      const result: Record<string, unknown> = { _score: r._score, _id: r._id }
      for (const [k, v] of Object.entries(doc)) result[k] = v
      return result as SearchResult<T>
    })
  }
}
