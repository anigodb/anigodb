<div align="center">
  <img src="./icon/logo_b.png" alt="AnigoDB logo" width="600">
  <h2><strong>Anything Goes</strong></h2>
  <p>AnigoDB is a document database library with DB-level data encryption and MongoDB-style API. Built for Node.js — synchronous, fast, and embeddable.</p>
</div>

```js
import { AnigoDB } from 'anigodb'

const db = AnigoDB.connect({ path: './my-db.db' })
const coll = db.collection('users')

coll.insertOne({ name: 'Alice', age: 30 })
const found = coll.findOne({ name: 'Alice' })
```

## Features

- **MongoDB-style API** — `insertOne`, `find`, `updateOne`, `deleteMany`, `aggregate`, etc.
- **Synchronous** — wraps better-sqlite3, no callbacks, no promises
- **Query operators** — `$eq`, `$gt`, `$gte`, `$lt`, `$lte`, `$ne`, `$in`, `$nin`, `$exists`, `$regex`, `$and`, `$or`, `$not`, `$nor`
- **Update operators** — `$set`, `$unset`, `$inc`, `$push`, `$pull`, `$rename`, `$mul`, `$min`, `$max`
- **Encryption** — full database encryption via better-sqlite3-multiple-ciphers
- **RAG search** — hybrid vector + keyword search with local ONNX embeddings; falls back to keyword-only when no embedding model is configured; `_score` is cosine similarity (0–1) for vector results, raw BM25 for keyword; supports `hybrid`, `vector`, and `keyword` modes
- **Transactions** — synchronous, nested via savepoints
- **Aggregation** — `$match`, `$sort`, `$skip`, `$limit`, `$count`
- **Indexes** — `createIndex`, `dropIndex`
- **TypeScript** — full type definitions
- **Dual ESM/CJS** — works with both `import` and `require`

## Installation

```sh
npm install anigodb
```

AnigoDB depends on `better-sqlite3-multiple-ciphers` (compiles native code). See [docs/01-getting-started.md](docs/01-getting-started.md) for platform prerequisites.

## Quick Start

```js
import { AnigoDB } from 'anigodb'

const db = AnigoDB.connect({ path: './data.db' })
const users = db.collection('users')

// Insert
const result = users.insertOne({ name: 'Alice', age: 30, role: 'admin' })
console.log('Inserted:', result.insertedId)

// Find with query operators
const admin = users.findOne({ role: 'admin', age: { $gte: 21 } })
console.log('Admin:', admin.name)

// Update
users.updateOne({ _id: result.insertedId }, { $set: { age: 31 }, $inc: { logins: 1 } })

// Aggregate
const stats = users.aggregate([{ $match: { role: 'admin' } }, { $count: 'total' }])
console.log('Admin count:', stats[0]?.total)

// Transactions
db.transaction(() => {
  users.insertOne({ name: 'Bob' })
  users.insertOne({ name: 'Charlie' })
})

// Encryption
const secure = AnigoDB.connect({ path: './secure.db', key: 'my-32-byte-hex-key-here...' })

// RAG search — without an embedding model, creates FTS5 only (keyword search)
const db2 = AnigoDB.connect({ path: './data.db' })
const notes = db2.collection('notes')
notes.createRAGIndex('body')
notes.insertOne({ body: 'Trains models on labeled data.' })
const kw = notes.search('labeled data', { limit: 5 })
// → keyword search, _score is raw BM25

// With an embedding model → full hybrid (vector + keyword) search
const db3 = AnigoDB.connect({
  path: './hybrid.db',
  embedding: { model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX', dtype: 'q8' },
})
const articles = db3.collection('articles')
articles.createRAGIndex('title')
articles.insertOne({ title: 'Machine Learning' })
const results = articles.search('machine learning', { limit: 5 })
// _score is cosine similarity (0–1)

// Search modes
articles.search('machine learning', { mode: 'vector', limit: 5 })  // semantic only
articles.search('machine learning', { mode: 'keyword', limit: 5 }) // FTS5 only

db.close()
```

## Documentation

| Topic            | File                                                       |
| ---------------- | ---------------------------------------------------------- |
| Getting Started  | [docs/01-getting-started.md](docs/01-getting-started.md)   |
| API Reference    | [docs/02-api-reference.md](docs/02-api-reference.md)       |
| Query Operators  | [docs/03-query-operators.md](docs/03-query-operators.md)   |
| Update Operators | [docs/04-update-operators.md](docs/04-update-operators.md) |
| Indexes          | [docs/05-indexes.md](docs/05-indexes.md)                   |
| Encryption       | [docs/06-encryption.md](docs/06-encryption.md)             |
| Transactions     | [docs/07-transactions.md](docs/07-transactions.md)         |
| Bulk Operations  | [docs/08-bulk-operations.md](docs/08-bulk-operations.md)   |
| Aggregation      | [docs/09-aggregation.md](docs/09-aggregation.md)           |
| Error Handling   | [docs/10-error-handling.md](docs/10-error-handling.md)     |
| Configuration    | [docs/11-configuration.md](docs/11-configuration.md)       |
| FAQ              | [docs/12-faq.md](docs/12-faq.md)                           |
| RAG Search       | [docs/13-rag-search.md](docs/13-rag-search.md)             |

## Examples

- [examples/optional-embedding.mjs](examples/optional-embedding.mjs) — Keyword-only vs hybrid search, meta persistence, reopen without `embedding`
- [examples/rag.mjs](examples/rag.mjs) — Encryption, RAG index creation, and hybrid search
- [examples/rag-search.mjs](examples/rag-search.mjs) — Minimal RAG search with cosine-similarity scores
- [examples/score-demo.mjs](examples/score-demo.mjs) — Score visualization, mode comparison, and lazy-loading proof

## License

MIT
