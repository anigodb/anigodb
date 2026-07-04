// Score & Lazy-Loading Demo
//
// Proves three changes:
//   1. _score = cosine similarity (0–1), not opaque RRF (0.01–0.03)
//   2. Embedding model loads lazily — not at connect() or createRAGIndex()
//   3. Three search modes each return correct score type
//
// Run: node examples/score-demo.mjs

import { tmpdir } from 'os'
import { join } from 'path'
import { rmSync, existsSync } from 'fs'
import { AnigoDB } from '../dist/esm/index.js'

const dbPath = join(tmpdir(), `anigodb-score-demo-${Date.now()}.db`)

// ---- Setup ----
// vectorSize=1024 tells AnigoDB the dimension upfront,
// so it NEVER loads the model during setup — only on first embed call.
const db = AnigoDB.connect({
  path: dbPath,
  embedding: {
    model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
    dtype: 'q8',
    pooling: 'mean',
    vectorSize: 1024,
  },
})
const docs = db.collection('knowledge')

// ---- Phase 1: Insert data BEFORE creating RAG index ----
// This means no triggers fire, no backfill runs → model never touched.
console.time('insert')
docs.insertMany([
  { _id: '1', title: 'Quantum Computing',       body: 'Quantum computers use qubits and superposition to solve certain problems exponentially faster than classical computers.' },
  { _id: '2', title: 'Machine Learning',         body: 'Supervised learning trains models on labeled datasets to predict outcomes for unseen data.' },
  { _id: '3', title: 'Database Indexing',        body: 'B-tree indexes accelerate lookups by maintaining a sorted structure for fast search, insert, and delete.' },
  { _id: '4', title: 'Classical Mechanics',      body: 'Newtonian mechanics describes motion through forces, mass, and acceleration using F=ma.' },
  { _id: '5', title: 'Viennese Coffee',          body: 'A Melange is an Austrian coffee specialty topped with foamed milk, often served with a glass of water.' },
])
console.timeEnd('insert')
console.log('Model NOT loaded yet — no RAG index, no embed call happened\n')

// ---- Phase 2: Create RAG index ----
// The vec0 table + FTS5 table + triggers are created.
// Backfill runs here → first onEmbed call → MODEL LOADS.
console.time('createRAGIndex')
docs.createRAGIndex('title')
docs.createRAGIndex('body')
console.timeEnd('createRAGIndex')
console.log('Model loaded during backfill (first embed call)\n')

// ---- Phase 3: Verify score is cosine similarity (0–1) ----

console.log('=== HYBRID SEARCH (default) ===')
console.log('_score = cosine similarity (0=unrelated, 1=identical)\n')

const r1 = docs.search('quantum computing qubits superposition', { limit: 4 })
for (const r of r1) {
  const pct = (r._score * 100).toFixed(1)
  const bar = '█'.repeat(Math.round(r._score * 30))
  console.log(`  ${pct.padStart(5)}% ${bar}  ${r.title}`)
}

console.log('\n→ The top result ("Quantum Computing") should be near 100%.')
console.log('  "Classical Mechanics" and "Viennese Coffee" should be near 0%.\n')

const r2 = docs.search('coffee beverage', { limit: 4 })
for (const r of r2) {
  const pct = (r._score * 100).toFixed(1)
  const bar = '█'.repeat(Math.round(r._score * 30))
  console.log(`  ${pct.padStart(5)}% ${bar}  ${r.title}`)
}

console.log('\n→ Only "Viennese Coffee" should score high.')
console.log('  Compare with old RRF scores that were always 1–3%.\n')

// ---- Phase 4: Compare search modes ----

console.log('=== MODE COMPARISON for "machine learning training" ===\n')

const h = docs.search('machine learning training', { limit: 3, mode: 'hybrid' })
console.log(`hybrid  (semantic + keyword, RRF-ranked):`)
for (const r of h) console.log(`  ${(r._score*100).toFixed(1)}%  ${r.title}`)

const v = docs.search('machine learning training', { limit: 3, mode: 'vector' })
console.log(`\nvector  (semantic only):`)
for (const r of v) console.log(`  ${(r._score*100).toFixed(1)}%  ${r.title}`)

const k = docs.search('machine learning training', { limit: 3, mode: 'keyword' })
console.log(`\nkeyword (FTS5 full-text only):`)
for (const r of k) console.log(`  score=${r._score.toFixed(1)}  ${r.title}`)

console.log('\n→ "machine learning" matches via all three modes.')
console.log('  But "qubits" only matches semantically (vector/hybrid),\n  not via keyword (no exact term match in title).\n')

// ---- Phase 5: Cross-collection search ----
console.log('=== GLOBAL SEARCH ===')
const topics = db.collection('topics')
topics.createRAGIndex('body')
topics.insertOne({ _id: 't1', title: 'ML Basics', body: 'Fundamentals of machine learning and statistical modeling' })

const global = db.search('machine learning', { limit: 5 })
for (const r of global) {
  const pct = (r._score * 100).toFixed(1)
  const src = r._collection ?? r._table
  console.log(`  ${pct.padStart(5)}%  [${src}] ${r.title}`)
}

// ---- Cleanup ----
db.close()
rmSync(dbPath)
console.log('\nDone — database cleaned up')
