// AnigoDB example: Encrypted database with 200k record bulk insert
//
// Run: node examples/mass-insert.mjs

import { tmpdir } from 'os'
import { join } from 'path'
import { existsSync, statSync } from 'fs'
import { randomBytes } from 'crypto'
import { AnigoDB } from '../dist/esm/index.js'

const FIRST_NAMES = ['Alice','Bob','Charlie','Diana','Eve','Frank','Grace','Henry','Ivy','Jack','Kate','Leo','Mia','Noah','Olivia','Paul','Quinn','Rose','Sam','Tina','Uma','Vince','Wendy','Xander','Yuki','Zara']
const LAST_NAMES  = ['Smith','Jones','Lee','Kim','Chen','Patel','Brown','Davis','Miller','Wilson','Moore','Taylor','Anderson','Thomas','Jackson','White','Harris','Martin','Thompson','Garcia']
const CATEGORIES  = ['Electronics','Clothing','Books','Home','Sports','Beauty','Food','Toys']
const STATUSES    = ['pending','shipped','delivered','cancelled']

function randomEmail() {
  const first = FIRST_NAMES[(Math.random() * FIRST_NAMES.length) | 0].toLowerCase()
  const last = LAST_NAMES[(Math.random() * LAST_NAMES.length) | 0].toLowerCase()
  return `${first}.${last}${(Math.random() * 999) | 0}@example.com`
}

function generateRecords(start, count) {
  const records = []
  for (let i = start; i < count+start; i++) {
    records.push({
      _id: `rec_${i}`,
      name: `${FIRST_NAMES[(Math.random() * FIRST_NAMES.length) | 0]} ${LAST_NAMES[(Math.random() * LAST_NAMES.length) | 0]}`,
      email: randomEmail(),
      age: (18 + Math.random() * 62) | 0,
      category: CATEGORIES[(Math.random() * CATEGORIES.length) | 0],
      status: STATUSES[(Math.random() * STATUSES.length) | 0],
      score: Math.round(Math.random() * 1000),
      tags: ['registered', ['active','inactive'][(Math.random() * 2) | 0]],
      createdAt: new Date(Date.now() - Math.random() * 3.15e10).toISOString(),
    })
  }
  return records
}

// --- Setup encrypted database ---

const dbPath = join(tmpdir(), `anigodb-mass-insert-${Date.now()}.db`)
const key = randomBytes(32).toString('hex')

console.log('Database:', dbPath)
console.log('Encryption key length:', key.length, 'hex chars')

const db = AnigoDB.connect({ path: dbPath, key, embedding:{
  model: 'Xenova/multilingual-e5-small',
  dtype: 'q4',
  pooling: 'mean',
  normalize: true,
  vectorSize: 384,
} })
const items = db.collection('items')

// --- Bulk insert 200k records ---

const COUNT = 200
console.log(`\nInserting ${COUNT.toLocaleString()} records...`)

const start = performance.now()
const records = generateRecords(0,COUNT)
items.insertMany(records)
const elapsed = ((performance.now() - start) / 1000).toFixed(2)
const count = items.countDocuments({})

console.log(`Inserted ${count.toLocaleString()} records in ${elapsed}s`)
console.log(`Rate: ${(COUNT / parseFloat(elapsed)).toLocaleString(undefined, { maximumFractionDigits: 0 })} records/s`)

console.time('create RAG index')
items.createRAGIndex('email')
console.timeEnd('create RAG index')


const start2 = performance.now()
const records2 = generateRecords(COUNT,COUNT)
items.insertMany(records2)
const elapsed2 = ((performance.now() - start2) / 1000).toFixed(2)
const count2 = items.countDocuments({})


console.log(`Inserted ${count2.toLocaleString()} records2 in ${elapsed2}s`)
console.log(`Rate: ${(COUNT / parseFloat(elapsed2)).toLocaleString(undefined, { maximumFractionDigits: 0 })} records/s`)

// --- Cleanup ---

db.close()
console.log(`\nDatabase file: ${(existsSync(dbPath) ? statSync(dbPath).size / 1024 / 1024 : 0).toFixed(1)} MB`)
console.log('Done')
