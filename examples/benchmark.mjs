// AnigoDB comprehensive capability verification.
// Manages 3 collections with 200k+ records, tests every feature.
//
// Run: node examples/benchmark.mjs
// First run downloads the embedding model (~600MB).

import { tmpdir } from 'os'
import { join } from 'path'
import { rmSync, existsSync, mkdirSync, statSync } from 'fs'
import { randomBytes } from 'crypto'
import { AnigoDB } from '../dist/esm/index.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0

function heading(label) {
  console.log(`\n━━━ ${label} ━━━`)
}

function check(label, ok) {
  if (ok) { passed++; return }
  failed++
  console.log(`  ✗ ${label}`)
}

function report() {
  const elapsed = ((performance.now()) / 1000).toFixed(2)
  console.log(`  ✓ (${elapsed}s)`)
}

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0]
}

// ---------------------------------------------------------------------------
// Data generators
// ---------------------------------------------------------------------------

const FIRST_NAMES = ['Alice','Bob','Charlie','Diana','Eve','Frank','Grace','Henry','Ivy','Jack','Kate','Leo','Mia','Noah','Olivia','Paul','Quinn','Rose','Sam','Tina','Uma','Vince','Wendy','Xander','Yuki','Zara']
const LAST_NAMES  = ['Smith','Jones','Lee','Kim','Chen','Patel','Brown','Davis','Miller','Wilson','Moore','Taylor','Anderson','Thomas','Jackson','White','Harris','Martin','Thompson','Garcia']
const CATEGORIES  = ['Electronics','Clothing','Books','Home','Sports','Beauty','Food','Toys']
const ROLES       = ['user','admin','moderator']
const STATUSES    = ['pending','shipped','delivered','cancelled']
const PRODUCT_ADJ = ['Premium','Ultra','Pro','Classic','Eco','Smart','Portable','Compact']
const PRODUCT_NOUN= ['Widget','Gadget','Device','Kit','Set','Tool','Bundle','Pack']

function randomEmail() {
  return `${pick(FIRST_NAMES).toLowerCase()}.${pick(LAST_NAMES).toLowerCase()}${Math.floor(Math.random() * 999)}@example.com`
}

function generateUsers(count) {
  const users = []
  for (let i = 0; i < count; i++) {
    users.push({
      _id: `usr_${i}`,
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      email: randomEmail(),
      age: 18 + (Math.random() * 62) | 0,
      role: pick(ROLES),
      tags: ['registered', pick(['active', 'inactive']), pick(['vip', 'standard'])],
      address: { city: pick(['NYC', 'LA', 'Chicago', 'Houston', 'Phoenix']), zip: String(10000 + (Math.random() * 90000) | 0) },
      score: Math.round(Math.random() * 1000),
      createdAt: new Date(Date.now() - Math.random() * 3.15e10).toISOString(),
    })
  }
  return users
}

function generateProducts(count) {
  const products = []
  for (let i = 0; i < count; i++) {
    const cat = pick(CATEGORIES)
    const name = `${pick(PRODUCT_ADJ)} ${pick(PRODUCT_NOUN)}`
    products.push({
      _id: `prod_${i}`,
      name: `${name} v${(Math.random() * 5 + 1).toFixed(1)}`,
      category: cat,
      price: +(Math.random() * 499 + 0.99).toFixed(2),
      stock: (Math.random() * 500) | 0,
      tags: [cat.toLowerCase(), pick(['new','sale','clearance','bestseller'])],
      rating: +(Math.random() * 5).toFixed(1),
      description: `High-quality ${cat.toLowerCase()} product #${i}`,
    })
  }
  return products
}

function generateOrders(count, maxUserId, maxProdId) {
  const orders = []
  for (let i = 0; i < count; i++) {
    const qty = 1 + (Math.random() * 5) | 0
    const price = +(Math.random() * 200 + 5).toFixed(2)
    orders.push({
      _id: `ord_${i}`,
      userId: `usr_${(Math.random() * maxUserId) | 0}`,
      productId: `prod_${(Math.random() * maxProdId) | 0}`,
      quantity: qty,
      unitPrice: price,
      total: +(qty * price).toFixed(2),
      status: pick(STATUSES),
      createdAt: new Date(Date.now() - Math.random() * 1.58e10).toISOString(),
    })
  }
  return orders
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const dbDir = join(tmpdir(), 'anigodb-bench')
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true })
const dbPath = join(dbDir, `bench-${Date.now()}.db`)
const key = randomBytes(32).toString('hex')

console.log(`AnigoDB Benchmark — ${dbPath}`)
console.log(`Database encrypted: yes (key length ${key.length} hex chars)`)

const db = AnigoDB.connect({
  path: dbPath,
  key,
  cacheSize: 256000,
  synchronous: 'off',
})

const users = db.collection('users')
const products = db.collection('products')
const orders = db.collection('orders')

// =========================================================================
// 1. BULK INSERT — 200k records
// =========================================================================

heading('Bulk Insert (200k records)')

const USER_COUNT = 100_000
const PRODUCT_COUNT = 60_000
const ORDER_COUNT = 40_000
const TOTAL = USER_COUNT + PRODUCT_COUNT + ORDER_COUNT

let t = performance.now()
const rawUsers = generateUsers(USER_COUNT)
users.insertMany(rawUsers)
const uCount = users.countDocuments({})
const uOk = uCount === USER_COUNT
console.log(`  Users:    ${USER_COUNT.toLocaleString()} inserted, found ${uCount.toLocaleString()}`)
check('Users count', uOk)

const rawProducts = generateProducts(PRODUCT_COUNT)
products.insertMany(rawProducts)
const pCount = products.countDocuments({})
const pOk = pCount === PRODUCT_COUNT
console.log(`  Products: ${PRODUCT_COUNT.toLocaleString()} inserted, found ${pCount.toLocaleString()}`)
check('Products count', pOk)

const rawOrders = generateOrders(ORDER_COUNT, USER_COUNT, PRODUCT_COUNT)
orders.insertMany(rawOrders)
const oCount = orders.countDocuments({})
const oOk = oCount === ORDER_COUNT
console.log(`  Orders:   ${ORDER_COUNT.toLocaleString()} inserted, found ${oCount.toLocaleString()}`)
check('Orders count', oOk)

console.log(`  Total:    ${TOTAL.toLocaleString()} records in ${((performance.now() - t) / 1000).toFixed(1)}s`)

// =========================================================================
// 2. INDEXES
// =========================================================================

heading('Indexes')

t = performance.now()
const idxAge    = users.createIndex({ age: 1 })
const idxEmail  = users.createIndex({ email: 1 })
const idxRole   = users.createIndex({ role: 1 })
const idxCat    = products.createIndex({ category: 1 })
const idxPrice  = products.createIndex({ price: 1 })
const idxStatus = orders.createIndex({ status: 1 })
const idxUid    = orders.createIndex({ userId: 1 })
console.log(`  7 indexes created in ${((performance.now() - t) * 1000).toFixed(0)}μs`)
users.dropIndex(idxEmail)
users.createIndex({ email: 1 })
check('Index create/drop/recreate', true)

// =========================================================================
// 3. QUERY OPERATORS
// =========================================================================

heading('Query Operators')

t = performance.now()

let foundUser = users.findOne({ _id: 'usr_42' })
check('findOne by _id', foundUser !== null && foundUser._id === 'usr_42')

let results = orders.find({ status: 'delivered' })
check('find implicit $eq', results.length > 0 && results[0].status === 'delivered')

results = products.find({ price: { $gt: 400 } })
check('$gt price > 400', results.every(r => r.price > 400))

results = users.find({ age: { $gte: 60 } })
check('$gte age >= 60', results.every(r => r.age >= 60))

results = users.find({ age: { $lt: 21 } })
check('$lt age < 21', results.every(r => r.age < 21))

results = products.find({ price: { $lte: 10 } })
check('$lte price <= 10', results.every(r => r.price <= 10))

results = users.find({ role: { $ne: 'user' } })
check('$ne not "user"', results.every(r => r.role !== 'user'))

results = users.find({ role: { $in: ['admin', 'moderator'] } })
check('$in admin|moderator', results.every(r => ['admin', 'moderator'].includes(r.role)))

results = users.find({ role: { $nin: ['user', 'admin'] } })
check('$nin not user|admin', results.every(r => r.role === 'moderator'))

results = users.find({ address: { $exists: true } })
check('$exists address', results.length > 0 && results.every(r => r.address !== undefined))

results = users.find({ nonexistent: { $exists: false } })
check('$exists false for missing field', results.length > 0)

results = users.find({ email: { $regex: '\\.smith\\d+@' } })
check('$regex email .smithNNN@', results.every(r => /\.smith\d+@/.test(r.email)))

results = users.find({ $and: [{ age: { $gte: 30 } }, { age: { $lte: 40 } }] })
check('$and age 30-40', results.every(r => r.age >= 30 && r.age <= 40))

results = users.find({ $or: [{ role: 'admin' }, { role: 'moderator' }] })
check('$or admin|moderator', results.every(r => ['admin', 'moderator'].includes(r.role)))

results = users.find({ role: { $not: { $eq: 'user' } } })
check('$not user', results.every(r => r.role !== 'user'))

results = users.find({ $and: [{ $or: [{ role: 'admin' }, { role: 'moderator' }] }, { age: { $gte: 50 } }] })
check('combined $and+$or+$gte', results.every(r => ['admin', 'moderator'].includes(r.role) && r.age >= 50))

results = users.find({ 'address.city': 'NYC' })
check('dot notation address.city', results.every(r => r.address?.city === 'NYC'))

results = users.find({}, { sort: { age: -1 }, skip: 5, limit: 10 })
check('find sort skip limit length', results.length === 10)

console.log(`  Query tests: ${((performance.now() - t) / 1000).toFixed(2)}s`)

// =========================================================================
// 4. UPDATE OPERATORS
// =========================================================================

heading('Update Operators')

t = performance.now()

const setResult = users.updateOne({ _id: 'usr_0' }, { $set: { name: 'Updated Name', age: 99 } })
check('updateOne $set matched', setResult.matchedCount === 1)
let doc = users.findOne({ _id: 'usr_0' })
check('updateOne $set name', doc.name === 'Updated Name')
check('updateOne $set age', doc.age === 99)

users.updateOne({ _id: 'usr_1' }, { $unset: { score: '' } })
doc = users.findOne({ _id: 'usr_1' })
check('updateOne $unset', doc.score === undefined)

users.updateOne({ _id: 'usr_0' }, { $inc: { age: 1 } })
doc = users.findOne({ _id: 'usr_0' })
check('updateOne $inc', doc.age === 100)

users.updateOne({ _id: 'usr_0' }, { $mul: { age: 2 } })
doc = users.findOne({ _id: 'usr_0' })
check('updateOne $mul', doc.age === 200)

users.updateOne({ _id: 'usr_0' }, { $min: { age: 150 } })
doc = users.findOne({ _id: 'usr_0' })
check('updateOne $min (no change)', doc.age === 150)

users.updateOne({ _id: 'usr_0' }, { $min: { age: 300 } })
doc = users.findOne({ _id: 'usr_0' })
check('updateOne $min higher (no change)', doc.age === 150)

users.updateOne({ _id: 'usr_0' }, { $max: { age: 50 } })
doc = users.findOne({ _id: 'usr_0' })
check('updateOne $max lower (no change)', doc.age === 150)

const renameTarget = users.findOne({ email: { $exists: true } })
if (renameTarget) {
  users.updateOne({ _id: renameTarget._id }, { $rename: { email: 'emailAddr' } })
  const afterRename = users.findOne({ _id: renameTarget._id })
  check('updateOne $rename new field', afterRename.emailAddr !== undefined)
  check('updateOne $rename old field', afterRename.email === undefined)
}

users.updateOne({ _id: 'usr_0' }, { $push: { tags: 'benchmarked' } })
doc = users.findOne({ _id: 'usr_0' })
check('updateOne $push', doc.tags.includes('benchmarked'))

users.updateOne({ _id: 'usr_0' }, { $pull: { tags: 'benchmarked' } })
doc = users.findOne({ _id: 'usr_0' })
check('updateOne $pull', !doc.tags.includes('benchmarked'))

const modCount = users.updateMany({ role: 'moderator' }, { $set: { role: 'user' } })
check('updateMany matched', modCount.matchedCount > 0)
check('updateMany modified', modCount.modifiedCount > 0)

const upsert = users.updateOne({ _id: 'upsert_test' }, { $set: { name: 'Upserted' } }, { upsert: true })
check('upsert matched 0', upsert.matchedCount === 0)
check('upsert has upsertedId', upsert.upsertedId !== null)
check('upsert doc exists', users.findOne({ _id: 'upsert_test' }) !== null)

console.log(`  Update tests: ${((performance.now() - t) / 1000).toFixed(2)}s`)

// =========================================================================
// 5. findOneAndUpdate / findOneAndDelete / findOneAndReplace
// =========================================================================

heading('Atomic Find-and-Modify')

t = performance.now()

const fau = users.findOneAndUpdate({ _id: 'usr_2' }, { $set: { name: 'FAU Update' } })
check('findOneAndUpdate returns before', fau !== null && fau._id === 'usr_2')

const fauAfter = users.findOneAndUpdate({ _id: 'usr_2' }, { $set: { name: 'FAU After' } }, { returnDocument: 'after' })
check('findOneAndUpdate returns after', fauAfter.name === 'FAU After')

const fad = users.findOneAndDelete({ _id: 'usr_3' })
check('findOneAndDelete returns doc', fad !== null && fad._id === 'usr_3')
check('findOneAndDelete actually deleted', users.findOne({ _id: 'usr_3' }) === null)

const far = users.findOneAndReplace({ _id: 'usr_4' }, { name: 'Replaced', age: 0 })
check('findOneAndReplace returns before', far !== null && far._id === 'usr_4')
check('findOneAndReplace changed', users.findOne({ _id: 'usr_4' }).name === 'Replaced')

const farAfter = users.findOneAndReplace({ _id: 'usr_5' }, { name: 'Far After', age: 1 }, { returnDocument: 'after' })
check('findOneAndReplace returns after', farAfter.name === 'Far After')

console.log(`  Atomic tests: ${((performance.now() - t) / 1000).toFixed(2)}s`)

// =========================================================================
// 6. AGGREGATION
// =========================================================================

heading('Aggregation')

t = performance.now()

const countRes = users.aggregate([{ $match: { role: 'user' } }, { $count: 'total' }])
check('aggregate $match + $count', countRes.length > 0 && countRes[0].total > 0)

const aggrRes = users.aggregate([{ $match: { age: { $gte: 25 } } }, { $sort: { age: -1 } }, { $skip: 5 }, { $limit: 3 }])
check('aggregate match sort skip limit', aggrRes.length === 3)

const catAggr = products.aggregate([{ $match: { category: 'Electronics' } }, { $count: 'total' }])
check('aggregate products by category', catAggr.length > 0 && catAggr[0].total > 0)

console.log(`  Aggregation: ${((performance.now() - t) / 1000).toFixed(2)}s`)

// =========================================================================
// 7. TRANSACTIONS
// =========================================================================

heading('Transactions')

t = performance.now()

let txResult
db.transaction(() => {
  users.insertOne({ _id: 'tx_test_1', name: 'Tx1', age: 1 })
  users.insertOne({ _id: 'tx_test_2', name: 'Tx2', age: 2 })
  txResult = 42
})
check('transaction returns value', txResult === 42)
check('transaction both inserts exist', users.findOne({ _id: 'tx_test_1' }) !== null)
check('transaction both inserts exist', users.findOne({ _id: 'tx_test_2' }) !== null)

try {
  db.transaction(() => {
    users.insertOne({ _id: 'tx_rollback_test', name: 'Rollback' })
    throw new Error('force rollback')
  })
} catch (_) {}
check('transaction rollback', users.findOne({ _id: 'tx_rollback_test' }) === null)

console.log(`  Transactions: ${((performance.now() - t) / 1000).toFixed(2)}s`)

// =========================================================================
// 8. DELETE OPERATIONS
// =========================================================================

heading('Delete Operations')

t = performance.now()

const delOne = users.deleteOne({ _id: 'usr_6' })
check('deleteOne matched', delOne.deletedCount === 1)
check('deleteOne gone', users.findOne({ _id: 'usr_6' }) === null)

const delMany = users.deleteMany({ age: { $lt: 20 } })
check('deleteMany deleted some', delMany.deletedCount > 0)
check('deleteMany all gone', users.find({ age: { $lt: 20 } }).length === 0)

console.log(`  Delete: ${((performance.now() - t) / 1000).toFixed(2)}s`)

// =========================================================================
// 9. COUNT DOCUMENTS
// =========================================================================

heading('Count Documents')

t = performance.now()

const totalUsers = users.countDocuments({})
check('countDocuments total', totalUsers > 0 && totalUsers <= USER_COUNT)

const totalAdults = users.countDocuments({ age: { $gte: 18 } })
check('countDocuments adults', totalAdults > 0 && totalAdults <= totalUsers)

console.log(`  ${totalUsers.toLocaleString()} users total, ${totalAdults.toLocaleString()} adults — ${((performance.now() - t) / 1000).toFixed(2)}s`)

// =========================================================================
// 10. RAG SEARCH (with encryption)
// =========================================================================

heading('RAG Search (encrypted)')

t = performance.now()

const notes = db.collection('notes')

notes.createRAGIndex('title')
notes.createRAGIndex('body')

notes.insertMany([
  { _id: 'n1', title: 'Machine Learning Basics', body: 'Supervised learning uses labeled data to train models that predict outcomes from input features' },
  { _id: 'n2', title: 'SQLite Internals', body: 'SQLite uses B-tree indexes and WAL journaling for crash-safe storage' },
  { _id: 'n3', title: 'Neural Networks', body: 'Deep neural networks with multiple hidden layers can learn complex patterns in data' },
  { _id: 'n4', title: 'Database Encryption', body: 'SQLCipher encrypts the entire database file page-by-page with AES-256' },
  { _id: 'n5', title: 'Vector Search', body: 'Similarity search compares embedding vectors using cosine distance to find related content' },
  { _id: 'n6', title: 'Natural Language Processing', body: 'Transformers and attention mechanisms revolutionized how machines understand text' },
  { _id: 'n7', title: 'Indexing Strategies', body: 'Proper indexing can speed up query performance by orders of magnitude' },
  { _id: 'n8', title: 'Data Persistence', body: 'Writing data to durable storage ensures it survives process restarts and power loss' },
  { _id: 'n9', title: 'Query Optimization', body: 'The query planner selects efficient execution strategies based on statistics' },
  { _id: 'n10', title: 'ACID Transactions', body: 'Atomic Consistent Isolated Durable transactions guarantee data integrity' },
])

const rag1 = notes.search('machine learning', { limit: 3, flush: true })
check('RAG search returns results', rag1.length > 0)
check('RAG has _score', rag1.every(r => typeof r._score === 'number'))
check('RAG top result relevant', rag1[0].title.toLowerCase().includes('machine') || rag1[0].title.toLowerCase().includes('learning'))

const rag2 = notes.search('encrypted database', { limit: 10 })
check('RAG search encrypted returns results', rag2.length > 0)
check('RAG finds database-related result', rag2.some(r => r.body?.toLowerCase().includes('encrypt') || r.title?.toLowerCase().includes('encrypt')))

const topics = db.collection('topics')
topics.createRAGIndex('description')
topics.insertOne({ _id: 't1', name: 'ML', description: 'Machine learning and deep neural network concepts' })

const global = db.search('machine', { limit: 5 })
check('global search returns results', global.length > 0)
check('global has _collection', global.some(r => r._collection !== undefined))

console.log(`  RAG: ${((performance.now() - t) / 1000).toFixed(2)}s`)

// =========================================================================
// 11. SORT & LIMIT EDGE CASES
// =========================================================================

heading('Sort and Limit Edge Cases')

t = performance.now()

const ascUsers = users.find({}, { sort: { age: 1 }, limit: 5 })
check('sort age ASC count', ascUsers.length === 5)

const descUsers = users.find({}, { sort: { age: -1 }, limit: 5 })
check('sort age DESC count', descUsers.length === 5)

const skipUsers = users.find({}, { sort: { _id: 1 }, skip: 10, limit: 5 })
check('skip+limit returns 5', skipUsers.length === 5)
check('skip+limit first _id not usr_0', skipUsers[0]._id !== 'usr_0')

const allFound = users.find({}, { limit: 10 })
check('empty filter returns 10', allFound.length === 10)

const noRes = users.find({ _id: 'nonexistent_id_xyz' })
check('no results for nonexistent', noRes.length === 0)

console.log(`  Sort/limit: ${((performance.now() - t) / 1000).toFixed(2)}s`)

// =========================================================================
// 12. ERROR HANDLING
// =========================================================================

heading('Error Handling')

t = performance.now()

try {
  users.insertOne({ _id: 'usr_0' })
  check('duplicate key throws (should not reach)', false)
} catch (e) {
  check('duplicate key error', e.name === 'DuplicateKeyError')
}

try {
  users.insertOne({ buffer: Buffer.from('test') })
  check('Buffer throws (should not reach)', false)
} catch (e) {
  check('Buffer type error', e.message.includes('Buffer'))
}

console.log(`  Error handling: ${((performance.now() - t) / 1000).toFixed(2)}s`)

// =========================================================================
// 13. CLEANUP
// =========================================================================

heading('Cleanup')

t = performance.now()
db.close()
check('close succeeds', true)

const fileSize = existsSync(dbPath) ? statSync(dbPath).size : 0
console.log(`  Database file size: ${(fileSize / 1024 / 1024).toFixed(1)} MB`)
//rmSync(dbPath)
//check('file cleaned up', !existsSync(dbPath))

// =========================================================================
// SUMMARY
// =========================================================================

console.log(`\n═══════════════════════════════════════════`)
console.log(`  Passed: ${passed}  Failed: ${failed}  Total: ${passed + failed}`)
console.log(`  Records processed: ${TOTAL.toLocaleString()}`)
console.log(`  Result: ${failed === 0 ? 'ALL OK ✓' : 'SOME FAILED ✗'}`)
console.log(`═══════════════════════════════════════════`)
process.exit(failed > 0 ? 1 : 0)
