import { tmpdir } from 'os'
import { join } from 'path'
import { rmSync, existsSync } from 'fs'
import Database from 'better-sqlite3-multiple-ciphers'

const path = join(tmpdir(), 'anigodb-bm25-debug-' + Date.now() + '.db')
const db = new Database(path)

db.exec('CREATE TABLE notes (rowid INTEGER PRIMARY KEY AUTOINCREMENT, _id TEXT NOT NULL UNIQUE, doc TEXT NOT NULL, created_at TEXT, updated_at TEXT)')
db.exec("CREATE VIRTUAL TABLE notes_fts_title USING fts5(title, tokenize='unicode61')")

const ins = db.prepare('INSERT INTO notes (_id, doc, created_at, updated_at) VALUES (?, ?, ?, ?)')
ins.run('1', JSON.stringify({ title: 'hello world' }), 'now', 'now')
ins.run('2', JSON.stringify({ title: 'goodbye world' }), 'now', 'now')
ins.run('3', JSON.stringify({ title: 'machine learning' }), 'now', 'now')

db.exec("INSERT INTO notes_fts_title (rowid, title) SELECT rowid, json_extract(doc, '$.title') FROM notes WHERE json_extract(doc, '$.title') IS NOT NULL")

const rows = db.prepare("SELECT rowid, rank FROM notes_fts_title WHERE title MATCH ? ORDER BY rank").all('world')
console.log('rank rows:', JSON.stringify(rows))

const bm25 = db.prepare("SELECT rowid, bm25(notes_fts_title) AS bm25, rank FROM notes_fts_title WHERE title MATCH ? ORDER BY rank").all('world')
console.log('bm25 rows:', JSON.stringify(bm25))

// Check with freq to understand
const info = db.prepare("SELECT rowid, rank, bm25(notes_fts_title) as bm, nearset(notes_fts_title) as near FROM notes_fts_title WHERE title MATCH ?").all('world')
console.log('info rows:', JSON.stringify(info))

// Query length info from stats
try {
  const stats = db.prepare("SELECT * FROM notes_fts_title('world')").all()
  for (const s of stats) console.log('stats:', JSON.stringify(s))
} catch(e) {
  console.log('stats error:', e.message)
}

db.close()
if (existsSync(path)) rmSync(path)
