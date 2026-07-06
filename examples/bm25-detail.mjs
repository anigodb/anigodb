import { tmpdir } from 'os'
import { join } from 'path'
import { rmSync, existsSync } from 'fs'
import Database from 'better-sqlite3-multiple-ciphers'

const path = join(tmpdir(), 'anigodb-bm25-detail-' + Date.now() + '.db')
const db = new Database(path)

// Simulate sqlite-hybrid contentless FTS5 with json_extract
db.exec("CREATE TABLE notes (rowid INTEGER PRIMARY KEY AUTOINCREMENT, _id TEXT NOT NULL UNIQUE, doc TEXT NOT NULL, created_at TEXT, updated_at TEXT)")
db.exec("CREATE VIRTUAL TABLE notes_fts_title USING fts5(title, tokenize='unicode61')")

const ins = db.prepare("INSERT INTO notes (_id, doc, created_at, updated_at) VALUES (?, ?, ?, ?)")
ins.run('1', JSON.stringify({ title: 'hello world' }), 'now', 'now')
ins.run('2', JSON.stringify({ title: 'goodbye world' }), 'now', 'now')
ins.run('3', JSON.stringify({ title: 'machine learning' }), 'now', 'now')

db.exec("INSERT INTO notes_fts_title (rowid, title) SELECT rowid, json_extract(doc, '$.title') FROM notes WHERE json_extract(doc, '$.title') IS NOT NULL")

// Check what rank we get for various terms
for (const q of ['world', 'hello', 'machine', 'goodbye']) {
  const r = db.prepare("SELECT rowid, rank, title FROM notes_fts_title WHERE title MATCH ? ORDER BY rank").all(q)
  console.log('query "' + q + '":', JSON.stringify(r))
}

// Check FTS5 internal doc stats
// The rank value might be affected by FTS5 internal stats computation
// Let's check what happens with a content-sync table instead
console.log('\n--- Also checking external content ---')
const path2 = join(tmpdir(), 'anigodb-bm25-ext-' + Date.now() + '.db')
const db2 = new Database(path2)

db2.exec("CREATE TABLE notes2 (rowid INTEGER PRIMARY KEY AUTOINCREMENT, _id TEXT NOT NULL UNIQUE, title TEXT NOT NULL, created_at TEXT, updated_at TEXT)")
db2.exec("CREATE VIRTUAL TABLE notes2_fts_title USING fts5(title, content=notes2, content_rowid='rowid', tokenize='unicode61')")

const ins2 = db2.prepare("INSERT INTO notes2 (_id, title, created_at, updated_at) VALUES (?, ?, ?, ?)")
ins2.run('1', 'hello world', 'now', 'now')
ins2.run('2', 'goodbye world', 'now', 'now')
ins2.run('3', 'machine learning', 'now', 'now')

// Rebuild FTS index (for external content)
db2.exec("INSERT INTO notes2_fts_title (notes2_fts_title, rank) VALUES ('rebuild', 0)")

for (const q of ['world', 'hello', 'machine', 'goodbye']) {
  const r = db2.prepare("SELECT rowid, rank, title FROM notes2_fts_title WHERE title MATCH ? ORDER BY rank").all(q)
  console.log('query "' + q + '":', JSON.stringify(r))
}

db.close()
db2.close()
if (existsSync(path)) rmSync(path)
if (existsSync(path2)) rmSync(path2)
