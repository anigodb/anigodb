import { tmpdir } from 'os'
import { join } from 'path'
import { rmSync, existsSync } from 'fs'
import Database from 'better-sqlite3-multiple-ciphers'

const path = join(tmpdir(), 'anigodb-bm25-confirm-' + Date.now() + '.db')
const db = new Database(path)

db.exec("CREATE TABLE notes (rowid INTEGER PRIMARY KEY AUTOINCREMENT, _id TEXT NOT NULL UNIQUE, doc TEXT NOT NULL, created_at TEXT, updated_at TEXT)")
db.exec("CREATE VIRTUAL TABLE notes_fts_title USING fts5(title, tokenize='unicode61')")

const ins = db.prepare("INSERT INTO notes (_id, doc, created_at, updated_at) VALUES (?, ?, ?, ?)")

// 20 docs: 19 with unique titles, 1 with "world"
for (let i = 0; i < 19; i++) {
  ins.run('id-' + i, JSON.stringify({ title: 'unique_title_' + i }), 'now', 'now')
}
ins.run('id-19', JSON.stringify({ title: 'hello world' }), 'now', 'now')

db.exec("INSERT INTO notes_fts_title (rowid, title) SELECT rowid, json_extract(doc, '$.title') FROM notes WHERE json_extract(doc, '$.title') IS NOT NULL")

console.log('With 20 docs where "world" appears only once:')
const r = db.prepare("SELECT rowid, rank, title FROM notes_fts_title WHERE title MATCH ? ORDER BY rank").all('world')
console.log(JSON.stringify(r))

db.close()
if (existsSync(path)) rmSync(path)
