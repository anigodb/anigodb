import { unlinkSync, existsSync } from 'fs'
import { AnigoDB } from '../dist/esm/index.js'

const DB = '/tmp/anigo_reopen_test.db'

function cleanup() {
  try { unlinkSync(DB) } catch {}
  try { unlinkSync(DB + '-wal') } catch {}
  try { unlinkSync(DB + '-shm') } catch {}
}

cleanup()

// --- Session 1: create DB with RAG index ---
console.log('=== Session 1: create + RAG index + insert ===')
const db1 = AnigoDB.connect({ path: DB })
const col1 = db1.collection('items')
col1.insertOne({ title: 'first document' })
db1.createRAGIndex('items', 'title')
col1.insertOne({ title: 'second document' })
console.log('Session 1 search count:', db1.search('items', 'document', 10).length)
db1.close()

// --- Session 2: re-open, insert WITHOUT calling createRAGIndex/search ---
console.log('\n=== Session 2: re-open + insert (no RAG init) ===')
const db2 = AnigoDB.connect({ path: DB })
const col2 = db2.collection('items')
try {
  col2.insertOne({ title: 'third document' })
  console.log('Insert succeeded')
} catch (err) {
  console.log('FAIL:', err.constructor.name, '-', err.message)
}
db2.close()

cleanup()
