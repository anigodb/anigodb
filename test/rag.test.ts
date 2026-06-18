import { describe, it, expect } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { rmSync, existsSync } from 'fs'
import Database from 'better-sqlite3-multiple-ciphers'
import { SqliteHybrid } from 'sqlite-hybrid'

describe('RAG via sqlite-hybrid', () => {
  it('creates vector and FTS5 indexes', () => {
    const path = join(tmpdir(), `anigodb-rag-test-${Date.now()}.db`)
    const db = new Database(path)

    db.exec(`CREATE TABLE articles (
      rowid INTEGER PRIMARY KEY AUTOINCREMENT,
      _id TEXT NOT NULL UNIQUE,
      doc TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`)

    const hybrid = new SqliteHybrid(db, {
      vectorSize: 4,
      onEmbed: () => new Float32Array([0.1, 0.2, 0.3, 0.4]),
    })

    hybrid.createVectorIndex('articles', "json_extract(doc, '$.title')")
    hybrid.createFTS5('articles', "json_extract(doc, '$.title')")

    // Insert test data
    const insert = db.prepare(`INSERT INTO articles (_id, doc, created_at, updated_at) VALUES (?, ?, ?, ?)`)
    insert.run('id1', JSON.stringify({ title: 'hello world' }), 'now', 'now')
    insert.run('id2', JSON.stringify({ title: 'goodbye world' }), 'now', 'now')

    // Search
    const results = hybrid.hybridSearch('articles', 'hello', 10)
    expect(Array.isArray(results)).toBe(true)

    db.close()
    if (existsSync(path)) rmSync(path)
  })

  it('supports global search across tables', () => {
    const path = join(tmpdir(), `anigodb-rag-test-${Date.now()}.db`)
    const db = new Database(path)

    db.exec(`CREATE TABLE notes (
      rowid INTEGER PRIMARY KEY AUTOINCREMENT,
      _id TEXT NOT NULL UNIQUE,
      doc TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`)

    const hybrid = new SqliteHybrid(db, {
      vectorSize: 2,
      onEmbed: () => new Float32Array([0.5, 0.5]),
    })

    hybrid.createVectorIndex('notes', "json_extract(doc, '$.content')")
    hybrid.createFTS5('notes', "json_extract(doc, '$.content')")

    const insert = db.prepare(`INSERT INTO notes (_id, doc, created_at, updated_at) VALUES (?, ?, ?, ?)`)
    insert.run('n1', JSON.stringify({ content: 'test note' }), 'now', 'now')

    // Global search (single arg)
    const results = hybrid.hybridSearch('test', 10)
    expect(Array.isArray(results)).toBe(true)

    db.close()
    if (existsSync(path)) rmSync(path)
  })
})
