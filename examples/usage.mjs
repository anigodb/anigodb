// AnigoDB comprehensive usage example
//
// Build first:  npm run build
// Run:          node examples/usage.mjs
//
// Walks through every major feature: connect, CRUD, queries, updates,
// indexes, aggregation, transactions, and RAG hybrid search.
//
// First run with RAG downloads the ONNX embedding model (~600MB) from
// Hugging Face. Subsequent runs use the local cache.

import { tmpdir } from 'os'
import { join } from 'path'
import { rmSync } from 'fs'
import { AnigoDB, DuplicateKeyError } from '../dist/esm/index.js'

// ─── 1. Connect ─────────────────────────────────────────────────────────────

const dbPath = join(tmpdir(), `anigodb-usage-${Date.now()}.db`)
console.log('Database:', dbPath)

const db = AnigoDB.connect({
  path: dbPath,
  wal: true,
  busyTimeout: 3000,
  cacheSize: 32000,
})

const movies = db.collection('movies')

// ─── 2. Insert Documents ────────────────────────────────────────────────────

// insertMany — returns array of generated _id values
const { insertedIds } = movies.insertMany([
  {
    title: 'The Matrix', year: 1999,
    genres: ['Action', 'Sci-Fi'],
    director: 'Lana Wachowski',
    cast: [
      { name: 'Keanu Reeves', role: 'Neo' },
      { name: 'Laurence Fishburne', role: 'Morpheus' },
    ],
    rating: 8.7,
    views: 52000,
  },
  {
    title: 'The Godfather', year: 1972,
    genres: ['Crime', 'Drama'],
    director: 'Francis Ford Coppola',
    cast: [
      { name: 'Marlon Brando', role: 'Don Vito Corleone' },
      { name: 'Al Pacino', role: 'Michael Corleone' },
    ],
    rating: 9.2,
    views: 41000,
  },
  {
    title: 'Inception', year: 2010,
    genres: ['Action', 'Sci-Fi', 'Thriller'],
    director: 'Christopher Nolan',
    cast: [
      { name: 'Leonardo DiCaprio', role: 'Cobb' },
      { name: 'Joseph Gordon-Levitt', role: 'Arthur' },
    ],
    rating: 8.8,
    views: 48000,
  },
  {
    title: 'Pulp Fiction', year: 1994,
    genres: ['Crime', 'Drama'],
    director: 'Quentin Tarantino',
    cast: [
      { name: 'John Travolta', role: 'Vincent Vega' },
      { name: 'Samuel L. Jackson', role: 'Jules Winnfield' },
    ],
    rating: 8.9,
    views: 39000,
  },
  {
    title: 'Parasite', year: 2019,
    genres: ['Drama', 'Thriller'],
    director: 'Bong Joon-ho',
    cast: [
      { name: 'Song Kang-ho', role: 'Kim Ki-taek' },
      { name: 'Cho Yeo-jeong', role: 'Yeon-gyo' },
    ],
    rating: 8.5,
    views: 27000,
  },
  {
    title: 'Moana', year: 2016,
    genres: ['Animation', 'Adventure', 'Family'],
    director: 'Ron Clements',
    cast: [
      { name: 'Auli\'i Cravalho', role: 'Moana' },
      { name: 'Dwayne Johnson', role: 'Maui' },
    ],
    rating: 7.6,
    views: 19000,
  },
  {
    title: 'Mad Max: Fury Road', year: 2015,
    genres: ['Action', 'Adventure', 'Sci-Fi'],
    director: 'George Miller',
    cast: [
      { name: 'Tom Hardy', role: 'Max Rockatansky' },
      { name: 'Charlize Theron', role: 'Furiosa' },
    ],
    rating: 8.1,
    views: 31000,
  },
])

console.log(`Inserted ${insertedIds.length} movies`)
console.log(`Total movies: ${movies.countDocuments({})}`)

// insertOne — returns the single generated _id
const { insertedId: leonId } = movies.insertOne({
  title: 'Léon: The Professional', year: 1994,
  genres: ['Action', 'Crime', 'Drama'],
  director: 'Luc Besson',
  cast: [
    { name: 'Jean Reno', role: 'Léon' },
    { name: 'Natalie Portman', role: 'Mathilda' },
  ],
  rating: 8.5,
  views: 22000,
})

console.log(`Inserted Léon with _id=${leonId}`)

// ─── 3. Query Documents ─────────────────────────────────────────────────────

// 3a. Find one by exact match
const matrix = movies.findOne({ title: 'The Matrix' })
console.log(`\nFound: ${matrix.title} (${matrix.year})`)

// 3b. Find with comparison operators
const after2000 = movies.find({ year: { $gt: 2000 } })
console.log(`Movies after 2000: ${after2000.length}`)

const modernClassics = movies.find({ year: { $gte: 1990, $lte: 2000 } })
console.log(`Movies 1990-2000: ${modernClassics.length}`)

// 3c. $in operator — filter by a list of scalar values
const byCoppolaOrNolan = movies.find({ director: { $in: ['Francis Ford Coppola', 'Christopher Nolan'] } })
console.log(`Movies by Coppola or Nolan: ${byCoppolaOrNolan.length}`)

const notCoppola = movies.find({ director: { $nin: ['Francis Ford Coppola'] } })
console.log(`Movies not by Coppola: ${notCoppola.length}`)

// 3d. Regex — use a string pattern (JavaScript RegExp, case-sensitive)
const titleSearch = movies.find({ title: { $regex: '^The' } })
console.log(`Titles starting with "The": ${titleSearch.length}`)

// 3e. Existence check
const withRating = movies.find({ rating: { $exists: true } })
console.log(`Movies with a rating: ${withRating.length}`)

// 3f. Logical operators ($and, $or)
const highRatedSince2000 = movies.find({
  $and: [
    { year: { $gte: 2000 } },
    { rating: { $gte: 8.5 } },
  ],
})
console.log(`Movies since 2000 rated ≥8.5: ${highRatedSince2000.length}`)

const byNolanOrTarantino = movies.find({
  $or: [
    { director: 'Christopher Nolan' },
    { director: 'Quentin Tarantino' },
  ],
})
console.log(`Movies by Nolan or Tarantino: ${byNolanOrTarantino.length}`)

// 3g. $not — negate a condition
const notNolan = movies.find({ director: { $not: 'Christopher Nolan' } })
console.log(`Movies not directed by Nolan: ${notNolan.length}`)

// 3h. Sort, skip, limit
const topRated = movies.find(
  {},
  { sort: { rating: -1 }, skip: 0, limit: 3 },
)
console.log(`\nTop 3 by rating:`)
for (const m of topRated) {
  console.log(`  ${m.title} — ${m.rating}`)
}

// ─── 4. Update Documents ────────────────────────────────────────────────────

// 4a. $set — update specific fields
movies.updateOne({ title: 'The Matrix' }, { $set: { rating: 8.7 } })

// 4b. $inc — increment a numeric field
movies.updateOne({ title: 'The Matrix' }, { $inc: { views: 1000 } })
const mat = movies.findOne({ title: 'The Matrix' })
console.log(`\nThe Matrix views after +1000: ${mat.views}`)

// 4c. $mul — multiply a numeric field
movies.updateMany({ year: { $lt: 2000 } }, { $mul: { views: 2 } })

// 4d. $push — append to an array
movies.updateOne({ title: 'Inception' }, { $push: { genres: 'Mind-Bending' } })

// 4e. $pull — remove from an array
movies.updateOne({ title: 'Inception' }, { $pull: { genres: 'Mind-Bending' } })

// 4f. $rename — rename a field
movies.updateOne({ title: 'Moana' }, { $rename: { director: 'directedBy' } })

// 4g. $unset — remove a field
movies.updateOne({ title: 'Moana' }, { $unset: { updated: '' } })

// 4h. Upsert — insert if not found
const { upsertedId } = movies.updateOne(
  { title: 'Arrival' },
  { $set: { year: 2016, genres: ['Drama', 'Sci-Fi'], rating: 7.9, views: 15000 } },
  { upsert: true },
)
console.log(`Upserted Arrival with _id=${upsertedId}`)

// 4i. updateMany — bulk update
const { modifiedCount } = movies.updateMany(
  { year: { $gt: 2010 } },
  { $set: { modern: 'yes' } },
)
console.log(`Marked ${modifiedCount} movies as modern`)

// 4j. findOneAndUpdate — atomic find + update (return before or after)
const before = movies.findOneAndUpdate(
  { title: 'Parasite' },
  { $inc: { views: 500 } },
  { returnDocument: 'before' },
)
console.log(`Parasite views before +500: ${before.views}`)

const after = movies.findOneAndUpdate(
  { title: 'Parasite' },
  { $inc: { views: 500 } },
  { returnDocument: 'after' },
)
console.log(`Parasite views after +500: ${after.views}`)

// 4k. findOneAndReplace
const replaced = movies.findOneAndReplace(
  { title: 'Léon: The Professional' },
  {
    title: 'Léon: The Professional', year: 1994,
    genres: ['Action', 'Crime', 'Drama'],
    director: 'Luc Besson',
    cast: [
      { name: 'Jean Reno', role: 'Léon' },
      { name: 'Natalie Portman', role: 'Mathilda' },
      { name: 'Gary Oldman', role: 'Stansfield' },
    ],
    rating: 8.5,
    views: 22000,
  },
  { returnDocument: 'after' },
)
console.log(`Replaced Léon — cast now has ${replaced.cast.length} members`)

// ─── 5. Delete Documents ────────────────────────────────────────────────────

// 5a. deleteOne
const { deletedCount: del1 } = movies.deleteOne({ title: 'Arrival' })
console.log(`\nDeleted ${del1} movie (Arrival)`)

// 5b. deleteMany
const { deletedCount: delMany } = movies.deleteMany({ year: { $lt: 1980 } })
console.log(`Deleted ${delMany} movies from before 1980`)

// 5c. findOneAndDelete
const gone = movies.findOneAndDelete({ title: 'Moana' })
console.log(`Deleted: ${gone.title}`)

// ─── 6. Indexes ─────────────────────────────────────────────────────────────

// Expression indexes on JSON paths accelerate queries
const idx1 = movies.createIndex({ year: -1 })
const idx2 = movies.createIndex({ rating: -1, year: -1 })
console.log(`\nCreated indexes: ${idx1}, ${idx2}`)

// Drop an index
movies.dropIndex(idx1)
console.log(`Dropped index: ${idx1}`)

// ─── 7. Aggregation ─────────────────────────────────────────────────────────

// Pipeline stages: $match → $sort → $skip → $limit → $count
const actionCount = movies.aggregate([
  { $match: { rating: { $gte: 8.5 } } },
  { $count: 'total' },
])
console.log(`\nMovies with rating ≥8.5 (aggregate): ${actionCount[0].total}`)

const sortedMovies = movies.aggregate([
  { $sort: { rating: -1 } },
  { $skip: 1 },
  { $limit: 3 },
])
console.log(`Movies ranked 2-4 by rating:`)
for (const m of sortedMovies) {
  console.log(`  ${m.title} — ${m.rating}`)
}

// ─── 8. Transactions ────────────────────────────────────────────────────────

try {
  db.transaction(() => {
    movies.insertOne({ title: 'Temp Movie 1', year: 2024, genres: ['Test'], rating: 5.0, views: 0 })
    movies.insertOne({ title: 'Temp Movie 2', year: 2024, genres: ['Test'], rating: 5.0, views: 0 })
    throw new Error('rollback')
  })
} catch {
  // Transaction rolled back — Temp Movies should not exist
}

const tempMovies = movies.find({ year: 2024 })
console.log(`\nTemp movies after rollback: ${tempMovies.length} (expected 0)`)

// Successful transaction
const txResult = db.transaction(() => {
  movies.updateOne({ title: 'The Matrix' }, { $inc: { views: 5000 } })
  movies.updateOne({ title: 'Inception' }, { $inc: { views: 5000 } })
  return 'done'
})
console.log(`Transaction result: ${txResult}`)

// ─── 9. Error Handling ───────────────────────────────────────────────────────

// DuplicateKeyError on duplicate _id
try {
  movies.insertOne({ _id: insertedIds[0], title: 'Duplicate', year: 2024, genres: ['Test'], rating: 1.0, views: 0 })
} catch (err) {
  if (err instanceof DuplicateKeyError) {
    console.log(`\nDuplicate _id caught: ${err.message}`)
  } else {
    throw err
  }
}

// findOne returns null when nothing matches
const nothing = movies.findOne({ title: 'Does Not Exist' })
console.log(`findOne missing doc: ${nothing}`)

// ─── 10. RAG / Hybrid Search ────────────────────────────────────────────────
//
// RAG indexes a text field for combined vector (cosine similarity) + keyword
// (BM25) search fused via Reciprocal Rank Fusion. The first call downloads
// the ONNX embedding model (~600MB) from Hugging Face. It is cached to
// ~/.hfembedder/.cache/models/ for subsequent runs.

console.log('\n')

// Create a separate collection to keep the RAG demo self-contained.
// The RAG index must be created BEFORE inserting documents so the
// AFTER INSERT trigger indexes them automatically.
const docs = db.collection('documents')

try {
  docs.createRAGIndex('content')
  console.log('RAG index created on "documents.content"')

  docs.insertMany([
    {
      title: 'Machine Learning Basics',
      content: 'Supervised learning uses labeled data to train models that can predict outcomes on new examples. Key algorithms include linear regression, decision trees, and support vector machines.',
    },
    {
      title: 'SQLite Internals',
      content: 'SQLite is an embedded relational database that uses B-tree indexes for fast lookups and WAL journaling for crash-safe concurrent reads. It stores each table as a separate B-tree.',
    },
    {
      title: 'Vector Databases',
      content: 'Vector databases index embedding vectors for similarity search. They use approximate nearest neighbor (ANN) algorithms like HNSW or IVF to find the closest vectors to a query at scale.',
    },
    {
      title: 'Full-Text Search',
      content: 'Full-text search engines like SQLite FTS5 tokenize text into terms and build an inverted index mapping each term to the documents containing it, enabling fast keyword-based retrieval.',
    },
  ])
  console.log(`Inserted ${docs.countDocuments({})} documents into RAG collection`)

  // Hybrid search — merges vector + keyword results via RRF
  const results = docs.search('how do I search vectors', { limit: 3 })
  console.log(`\nHybrid search "how do I search vectors" (top ${results.length}):`)
  for (const r of results) {
    console.log(`  [${r._score.toFixed(3)}] ${r.title}`)
  }

  // Global cross-collection search
  const all = db.search('database', { limit: 5 })
  console.log(`\nCross-collection search "database" (${all.length} results):`)
  for (const r of all) {
    const tag = r._collection ? ` [${r._collection}]` : ''
    console.log(`  [${r._score.toFixed(3)}]${tag} ${r.title}`)
  }
} catch (err) {
  console.log('RAG unavailable:', err.message)
  console.log('  Ensure dependencies are installed and model can be downloaded.')
}

// ─── 11. Cleanup ────────────────────────────────────────────────────────────

db.close()
rmSync(dbPath)
console.log('\nDone — database file removed.')
