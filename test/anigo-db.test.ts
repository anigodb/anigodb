import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { rmSync, existsSync } from 'fs'
import { AnigoDB } from '../src/anigo-db.js'

interface TestDb {
  db: AnigoDB
  path: string
}

const testDbs: TestDb[] = []

function createDb(options?: Partial<{ key: string; objectId: () => string }>): TestDb {
  const path = join(tmpdir(), `anigodb-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
  const db = AnigoDB.connect({ path, ...options })
  const entry: TestDb = { db, path }
  testDbs.push(entry)
  return entry
}

afterEach(() => {
  for (const { db, path } of testDbs) {
    try { db.close() } catch {}
    if (existsSync(path)) {
      try { rmSync(path) } catch {}
    }
  }
  testDbs.length = 0
})

describe('AnigoDB', () => {
  it('connect creates a database', () => {
    const { db } = createDb()
    expect(db).toBeDefined()
    expect(typeof db.collection).toBe('function')
  })

  it('connect rejects :memory:', () => {
    expect(() => AnigoDB.connect({ path: ':memory:' })).toThrow('not supported')
  })

  it('collection returns a Collection', () => {
    const { db } = createDb()
    const col = db.collection('test')
    expect(col.collectionName).toBe('test')
  })

  it('transaction works', () => {
    const { db } = createDb()
    const col = db.collection('users')
    const result = db.transaction(() => {
      col.insertOne({ name: 'Alice' })
      col.insertOne({ name: 'Bob' })
      return 'done'
    })
    expect(result).toBe('done')
    expect(col.countDocuments({})).toBe(2)
  })

  it('transaction rolls back on error', () => {
    const { db } = createDb()
    const col = db.collection('users')
    col.insertOne({ _id: 'existing' })
    expect(() =>
      db.transaction(() => {
        col.insertOne({ name: 'Alice' })
        col.insertOne({ _id: 'existing' })
      })
    ).toThrow()
    expect(col.countDocuments({})).toBe(1)
  })

  it('connect with key enables encryption', () => {
    const { db } = createDb({ key: 'test-key' })
    const col = db.collection('secret')
    col.insertOne({ data: 'sensitive' })
    expect(col.countDocuments({})).toBe(1)
  })

  it('close can be called multiple times', () => {
    const { db } = createDb()
    db.close()
    db.close()
  })

  it('reopen with RAG indexes does not break inserts', () => {
    const path = join(tmpdir(), `anigodb-rag-reopen-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    const db1 = AnigoDB.connect({ path })
    const col1 = db1.collection('items')
    col1.insertOne({ title: 'first' })
    db1.createRAGIndex('items', 'title')
    col1.insertOne({ title: 'second' })
    const results1 = db1.search('items', 'first', 10)
    expect(results1.length).toBeGreaterThan(0)
    db1.close()

    // Reopen and insert WITHOUT calling createRAGIndex or search
    const db2 = AnigoDB.connect({ path })
    const col2 = db2.collection('items')
    expect(() => {
      col2.insertOne({ title: 'third' })
    }).not.toThrow()
    const results2 = db2.search('items', 'third', 10)
    expect(results2.length).toBeGreaterThan(0)
    db2.close()

    if (existsSync(path)) rmSync(path)
  })

  it('custom objectId generator', () => {
    let counter = 0
    const { db } = createDb({ objectId: () => `custom-${++counter}` })
    const col = db.collection('test')
    const r1 = col.insertOne({ name: 'A' })
    const r2 = col.insertOne({ name: 'B' })
    expect(r1.insertedId).toBe('custom-1')
    expect(r2.insertedId).toBe('custom-2')
  })
})
