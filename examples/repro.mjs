import Database from 'better-sqlite3-multiple-ciphers'
import { SqliteHybrid } from 'sqlite-hybrid'
import { tmpdir } from 'os'
import { join } from 'path'
import { rmSync, existsSync } from 'fs'

const dbPath = join(tmpdir(), `anigodb-repro-${Date.now()}.db`)
console.log('DB:', dbPath)

const db = new Database(dbPath)

// Create the exact table schema that AnigoDB uses
db.exec(`CREATE TABLE IF NOT EXISTS "items" (
  _id TEXT NOT NULL UNIQUE,
  doc TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`)

// Insert records
const insert = db.prepare(`INSERT INTO "items" (_id, doc, created_at, updated_at) VALUES (?, ?, ?, ?)`)
for (let i = 0; i < 200; i++) {
  const doc = JSON.stringify({
    name: `Name ${i}`,
    email: `user${i}@example.com`,
    age: 20 + (i % 50),
    category: 'test',
    status: 'active',
    score: i,
  })
  insert.run(`rec_${i}`, doc, new Date().toISOString(), new Date().toISOString())
}

// Check the rowid
const rows = db.prepare('SELECT rowid, _id FROM "items" LIMIT 5').all()
console.log('Rowid samples:', rows)

// Now try creating the vector index
const hybrid = new SqliteHybrid(db, {
  vectorSize: 4,
  onEmbed: () => new Float32Array([0.1, 0.2, 0.3, 0.4]),
})

try {
  hybrid.createVectorIndex('items', "json_extract(doc, '$.email')")
  console.log('Vector index created successfully')
} catch (err) {
  console.error('ERROR:', err)
}

db.close()
if (existsSync(dbPath)) rmSync(dbPath)
