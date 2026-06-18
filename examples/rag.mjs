// AnigoDB example: Encrypted database with RAG search
//
// Run from project root:
//   node examples/rag.mjs
//
// First run downloads the embedding model (~600MB) from Hugging Face.
// Subsequent runs use the local cache (~/.hfembedder/.cache/models/).
//
// Import from the built dist when inside the repo.
// In your own project: import { AnigoDB } from 'anigodb'

import { tmpdir } from 'os'
import { join } from 'path'
import { rmSync, existsSync } from 'fs'
import { randomBytes } from 'crypto'
import { AnigoDB } from '../dist/esm/index.js'

// --- Setup ---

const dbPath = join(tmpdir(), `anigodb-encrypted-rag-${Date.now()}.db`)
const key = randomBytes(32).toString('hex')

console.log('Database:', dbPath)
console.log('Encryption key:', key.slice(0, 16) + '…')
console.log()

// --- Connect with encryption ---

const db = AnigoDB.connect({ path: dbPath, key })
const notes = db.collection('notes')

// --- Create RAG index FIRST (before inserting data) ---

console.log('Creating RAG index on "title"…')
console.log('  (First call downloads the model — may take a moment)')
notes.createRAGIndex('title')

console.log('Creating RAG index on "body"…')
notes.createRAGIndex('body')
console.log()

// --- Insert documents AFTER the index is created ---
// RAG triggers fire on INSERT, so existing documents are indexed immediately.

console.time('Inserting documents')
notes.insertMany([
  { title: 'Machine Learning Basics', body: 'Supervised learning uses labeled data to train models that predict outcomes.' },
  { title: 'SQLite Internals', body: 'SQLite uses B-tree indexes and WAL journaling for crash-safe storage.' },
  { title: 'Neural Networks', body: 'Deep neural networks with multiple hidden layers can learn complex patterns.' },
  { title: 'Database Encryption', body: 'SQLCipher encrypts the entire database file page-by-page with AES-256.' },
])
console.timeEnd('Inserting documents')

console.log(`Inserted ${notes.countDocuments({})} documents`)
console.log()

// --- Search ---
// Using { flush: true } ensures all pending embeddings are computed before
// the query runs. Without flush, search returns results from whatever has
// been indexed so far (eventual consistency).

const results1 = notes.search('machine learning', { limit: 3, flush: true })
console.log(`Search "machine learning" returned ${results1.length} results:`)
for (const r of results1) {
  console.log(`  [${r._score.toFixed(3)}] ${r.title}`)
}

const results2 = notes.search('encrypted storage', { limit: 3 })
console.log(`\nSearch "encrypted storage" returned ${results2.length} results:`)
for (const r of results2) {
  console.log(`  [${r._score.toFixed(3)}] ${r.title}`)
}

// --- Cross-collection search ---

const topics = db.collection('topics')
topics.createRAGIndex('description')

console.time('Inserting topic and indexing')
topics.insertOne({ name: 'AI', description: 'Artificial intelligence and machine learning topics' })
console.timeEnd('Inserting topic and indexing')

const all = db.search('AI', { limit: 5 })
console.log(`\nCross-collection search "AI" returned ${all.length} results:`)
for (const r of all) {
  const src = r._collection ? ` [${r._collection}]` : ''
  console.log(`  [${r._score.toFixed(3)}]${src} ${r.title || r.name || '(no title)'}`)
}

// --- Cleanup ---

db.close()
rmSync(dbPath)
console.log('\nDone — cleaned up database')
