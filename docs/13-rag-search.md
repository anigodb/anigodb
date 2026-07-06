# RAG Search

AnigoDB's RAG (Retrieval-Augmented Generation) search combines **vector semantic search** with **FTS5 keyword search** using Reciprocal Rank Fusion (RRF). It runs entirely locally — all embedding work is delegated to `sqlite-hybrid`, which uses `hf-embedder` under the hood.

## Embedding Configuration

RAG is **optional**. You control it via the `embedding` option in `AnigoDB.connect()`:

| `embedding` | Behaviour |
|---|---|
| Omitted | `createRAGIndex` creates FTS5 only. `search()` falls back to keyword mode. |
| `{ model: '...' }` | Full hybrid/vector/keyword search. vec0 + FTS5 created. |

When an embedding model is configured, the config is persisted to `_anigodb_meta` at `createRAGIndex()` time. On subsequent connections, the saved config is loaded automatically — you don't need to pass `embedding` on reopen.

```typescript
// Keyword-only: no model needed
const db1 = AnigoDB.connect({ path: './db.db' })
db1.collection('notes').createRAGIndex('title')  // FTS5 only

// Hybrid: model required
const db2 = AnigoDB.connect({ path: './db.db', embedding: { model: '...' } })
db2.collection('notes').createRAGIndex('title')  // vec0 + FTS5

// Reopen: saved meta loads automatically
const db3 = AnigoDB.connect({ path: './db.db' })
db3.collection('notes').search('query')          // full hybrid search
```

## Creating a RAG Index

```typescript
const articles = db.collection('articles');

// Index a field for hybrid search
articles.createRAGIndex('title');
articles.createRAGIndex('body');
```

`createRAGIndex()` is **synchronous** — it blocks until the FTS5 index (and optionally the `vec0` vector index) is created in SQLite. Triggers are installed so new/updated documents are automatically indexed.

## Searching

```typescript
// Collection-scoped search
const results = articles.search('machine learning');
// results: Array<{ _id, title, body, _score: number }>

// With structured filter + limit
articles.search('budget report', {
  filter: { year: 2026 },
  limit: 5,
});
```

### `db.search()` — Cross-Collection Search

```typescript
const allResults = db.search('machine learning');
// Results include a _collection field:
// [
//   { _collection: 'articles', _id: '...', title: '...', _score: 0.92 },
//   { _collection: 'notes', _id: '...', content: '...', _score: 0.74 },
// ]
```

### Flush Behavior

`search()` is **synchronous** and returns results immediately from whatever has been indexed so far (eventual consistency for the embedding queue). To ensure all pending embeddings are written before searching:

```typescript
articles.search('new document', { flush: true });
// Blocks until all pending embeddings for this collection are written, then returns results
```

## Search Options

```typescript
interface SearchOptions {
  limit?: number;           // Max results (default: 10)
  filter?: Filter<T>;       // Structured filter (same operators as find())
  mode?: 'hybrid' | 'vector' | 'keyword';  // Search mode. Default: 'hybrid'
  flush?: boolean;          // Wait for pending embeddings (default: false)
}
```

When no embedding model is configured, mode defaults to `keyword` regardless of what you pass. `vector` mode throws `RAGNotConfiguredError` if a vector search is attempted without a model.

## How It Works

### Index Time — With Embedding Model

```
createRAGIndex('body')
  │
  ├── sqlite-hybrid.createVectorIndex('articles', 'body')
  │     └── CREATE VIRTUAL TABLE vec_articles_body USING vec0(...)
  │     └── CREATE TRIGGER articles_ai AFTER INSERT ...
  │     └── CREATE TRIGGER articles_au AFTER UPDATE ...
  │     └── CREATE TRIGGER articles_ad AFTER DELETE ...
  │
  └── sqlite-hybrid.createFTS5('articles', 'body')
        └── CREATE VIRTUAL TABLE fts_articles_body USING fts5(...)
        └── CREATE TRIGGER fts_articles_ai AFTER INSERT ...
        └── CREATE TRIGGER fts_articles_au AFTER UPDATE ...
        └── CREATE TRIGGER fts_articles_ad AFTER DELETE ...
```

### Index Time — Without Embedding Model

```
createRAGIndex('body')
  │
  └── sqlite-hybrid.createFTS5('articles', 'body')
        └── (FTS5 only, no vec0)
```

Inserts/updates enqueue raw text. Calling `search({ flush: true })` drains the queue synchronously — `sqlite-hybrid` computes embeddings for each pending entry and writes them to `vec0` before the search runs.

### Query Time — With Embedding Model

```
search("machine learning")
  │
  ├── 1. Embed query → Float32Array[1024]
  │
  ├── 2. Vector search
  │     SELECT rowid, distance FROM vec_articles_body ...
  │
  ├── 3. Keyword search (FTS5 BM25)
  │     SELECT rowid, rank FROM fts_articles_body ...
  │
  ├── 4. RRF Fusion
  │     score = 1/(60 + rank_vec) + 1/(60 + rank_fts)
  │
  └── 5. Join + return
        SELECT _id, doc, ..., score AS _score FROM articles ...
```

### Query Time — Without Embedding Model

```
search("machine learning")
  │
  └── Keyword search (FTS5 BM25)
        SELECT rowid, rank FROM fts_articles_body ...
        ORDER BY rank
        LIMIT ?
```

## Limitations (MVP)

- Embedder model is required for vector/hybrid search. Without it, only keyword (FTS5) search is available. No plugin system for fully custom embedders yet.
- No snippet/chunk highlighting in search results.
- No `$elemMatch` or array path indexing for RAG.
- `db.search()` returns all matching documents across collections in one flat list — no grouping.
- `createRAGIndex` only supports top-level and dot-path nested fields (`'address.city'`), not array expansion.
