// Minimal RAG search example
//
// Run: node examples/rag-search.mjs
// First run downloads the embedding model (~600MB). Subsequent runs use cache.

import { tmpdir } from 'os'
import { join } from 'path'
import { rmSync } from 'fs'
import { AnigoDB } from '../dist/esm/index.js'

const dbPath = join(tmpdir(), `anigodb-rag-${Date.now()}.db`)
const db = AnigoDB.connect({ path: dbPath, embedding: { model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX', dtype: 'q8' } })
const docs = db.collection('notes')

// 1. Insert data
docs.insertMany([
  { title: 'Profile of Perry',   body: 'Perry is my wife. She is very pretty' },
  { title: 'Machine Learning',     body: 'Trains models on labeled data to predict outcomes.' },
  { title: 'Viennese Coffee',      body: 'Melange is espresso topped with foamed milk.' },
])

// 2. Create RAG index on the fields you want to search
docs.createRAGIndex('title')

console.log('\nSearch "Profile of Perry":')
for (const r of docs.search('Profile of Perry', { limit: 3 })) {
  console.log(`  ${(r._score * 100).toFixed(0)}%  ${r.title}`)
}



db.close()
rmSync(dbPath)
