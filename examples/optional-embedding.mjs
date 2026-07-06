// AnigoDB example: Optional embedding (auto fallback to keyword search)
//
// Run: node examples/optional-embedding.mjs
//
// Demonstrates:
//   1. No embedding → CRUD works, createRAGIndex creates FTS5 only
//   2. search without model → keyword (FTS5) search works
//   3. With model → full hybrid/vector/keyword search
//   4. Reopen — saved meta loads automatically

import { tmpdir } from 'os'
import { join } from 'path'
import { rmSync, existsSync } from 'fs'
import { AnigoDB } from '../dist/esm/index.js'
import { RAGNotConfiguredError } from '../dist/esm/errors.js'

const kwPath = join(tmpdir(), 'anigodb-keyword-' + Date.now() + '.db')
const hybridPath = join(tmpdir(), 'anigodb-hybrid-' + Date.now() + '.db')

// ============================================================
// 1. No embedding → CRUD works, createRAGIndex creates FTS5
// ============================================================

console.log('=== 1. No embedding (keyword-only mode) ===')
const db1 = AnigoDB.connect({ path: kwPath })
const col1 = db1.collection('notes')

col1.insertOne({ title: 'hello world' })
col1.insertOne({ title: 'goodbye world' })
col1.insertOne({ title: 'machine learning' })
console.log('Inserted 3 docs, count:', col1.countDocuments({}))

// Without model, createRAGIndex creates only FTS5 (keyword index)
col1.createRAGIndex('title')
console.log('createRAGIndex succeeded (FTS5 only)')

// search falls back to keyword automatically
const results1 = col1.search('world', { limit: 5 })
console.log('Search "world" returned ' + results1.length + ' results (keyword)')
for (const r of results1) {
  console.log('  [score ' + r._score.toFixed(4) + '] ' + r.title)
}

db1.close()
console.log()

// ============================================================
// 2. Reopen — still keyword-only, search works
// ============================================================

console.log('=== 2. Reopen (keyword-only) ===')
const db2 = AnigoDB.connect({ path: kwPath })
const col2 = db2.collection('notes')
col2.insertOne({ title: 'hello again' })
const results2 = col2.search('again', { limit: 5 })
console.log('Search "again" returned ' + results2.length + ' results (keyword)')
for (const r of results2) {
  console.log('  [score ' + r._score.toFixed(4) + '] ' + r.title)
}
db2.close()
if (existsSync(kwPath)) rmSync(kwPath)
console.log()

// ============================================================
// 3. With model → full hybrid search
// ============================================================

console.log('=== 3. With embedding model ===')
const db3 = AnigoDB.connect({
  path: hybridPath,
  embedding: { model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX', dtype: 'q8' },
})
const col3 = db3.collection('notes')
col3.insertOne({ title: 'hello world' })
col3.insertOne({ title: 'goodbye world' })
col3.insertOne({ title: 'machine learning' })

// With a model, createRAGIndex creates vec0 + FTS5 + saves meta
col3.createRAGIndex('title')
console.log('createRAGIndex succeeded (vec0 + FTS5)')

// Hybrid search (default) — combines vector + keyword
const results3 = col3.search('greetings', { limit: 5 })
console.log('Search "greetings" returned ' + results3.length + ' results (hybrid)')
for (const r of results3) {
  const pct = (r._score * 100).toFixed(0)
  console.log('  [' + pct + '%] ' + r.title)
}

db3.close()
console.log()

// ============================================================
// 4. Reopen — saved meta loaded, full search works
// ============================================================

console.log('=== 4. Reopen (saved meta loaded) ===')
const db4 = AnigoDB.connect({ path: hybridPath })
const col4 = db4.collection('notes')
const results4 = col4.search('greetings', { limit: 5 })
console.log('Search "greetings" returned ' + results4.length + ' results (hybrid from saved meta)')
for (const r of results4) {
  const pct = (r._score * 100).toFixed(0)
  console.log('  [' + pct + '%] ' + r.title)
}
db4.close()
if (existsSync(hybridPath)) rmSync(hybridPath)
console.log()

console.log('Done — cleaned up databases')
