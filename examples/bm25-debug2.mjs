import { tmpdir } from 'os'
import { join } from 'path'
import { rmSync, existsSync } from 'fs'
import Database from 'better-sqlite3-multiple-ciphers'

const path = join(tmpdir(), 'anigodb-bm25-v3-' + Date.now() + '.db')
const db = new Database(path)

db.exec("CREATE TABLE notes (rowid INTEGER PRIMARY KEY AUTOINCREMENT, _id TEXT NOT NULL UNIQUE, doc TEXT NOT NULL, created_at TEXT, updated_at TEXT)")
db.exec("CREATE VIRTUAL TABLE notes_fts_title USING fts5(title, tokenize='unicode61')")

const ins = db.prepare("INSERT INTO notes (_id, doc, created_at, updated_at) VALUES (?, ?, ?, ?)")
ins.run('1', JSON.stringify({ title: 'hello world' }), 'now', 'now')
ins.run('2', JSON.stringify({ title: 'goodbye world' }), 'now', 'now')
ins.run('3', JSON.stringify({ title: 'machine learning' }), 'now', 'now')

db.exec("INSERT INTO notes_fts_title (rowid, title) SELECT rowid, json_extract(doc, '$.title') FROM notes WHERE json_extract(doc, '$.title') IS NOT NULL")

// Check raw FTS content
console.log('=== FTS table raw content ===')
const all = db.prepare("SELECT rowid, title FROM notes_fts_title ORDER BY rowid").all()
for (const r of all) console.log(JSON.stringify(r))

// Check FTS5 stats
console.log('\n=== FTS5 config ===')
const cfg = db.prepare("SELECT * FROM notes_fts_title('_config')").all()
for (const c of cfg) console.log(JSON.stringify(c))

// Try with the bm25 config to check actual formula params
// According to FTS5 docs, we need to query through the fts_content table
try {
  console.log('\n=== FTS5 content table (if exists) ===')
  const content = db.prepare("SELECT * FROM notes_fts_title_content").all()
  for (const c of content) console.log(JSON.stringify(c).slice(0, 200))
} catch(e) { console.log('no content table:', e.message) }

// Check segments
try {
  console.log('\n=== FTS5 segments ===')
  const seg = db.prepare("SELECT * FROM notes_fts_title_segdir").all()
  for (const s of seg) console.log(JSON.stringify(s).slice(0, 200))
} catch(e) { console.log('no segdir:', e.message) }

// Try same thing but with a 4th document that's LONG
ins.run('4', JSON.stringify({ title: 'the world is a very big and beautiful place' }), 'now', 'now')
db.exec("INSERT INTO notes_fts_title (rowid, title) SELECT rowid, json_extract(doc, '$.title') FROM notes WHERE rowid = 4 AND json_extract(doc, '$.title') IS NOT NULL")

console.log('\n=== After adding a long doc ===')
for (const q of ['world', 'hello', 'goodbye', 'machine', 'big']) {
  const r = db.prepare("SELECT rowid, rank, title FROM notes_fts_title WHERE title MATCH ? ORDER BY rank").all(q)
  console.log('query "' + q + '":', JSON.stringify(r))
}

db.close()
if (existsSync(path)) rmSync(path)
