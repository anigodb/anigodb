# RAG Search

AnigoDB's RAG (Retrieval-Augmented Generation) search combines **vector semantic search** with **FTS5 keyword search** using Reciprocal Rank Fusion (RRF). It runs entirely locally — all embedding work is delegated to `sqlite-hybrid`, which uses `hf-embedder` under the hood.

## Prerequisites

```bash
npm install anigodb
```

## Creating a RAG Index

```typescript
const articles = db.collection('articles');

// Index a field for hybrid search
articles.createRAGIndex('title');
articles.createRAGIndex('body');
```

`createRAGIndex()` is **synchronous** — it blocks until both a **vector index** (`vec0` virtual table via sqlite-vec, dimension 1024) and an **FTS5 index** are created in SQLite. Triggers are installed so new/updated documents are automatically enqueued for embedding. All embedding work is handled by `sqlite-hybrid`.

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
  flush?: boolean;          // Wait for pending embeddings (default: false)
}
```

## How It Works

### Index Time

```
createRAGIndex('body')
  │
  ├── sqlite-hybrid.createVectorIndex('articles', 'body')
  │     └── CREATE VIRTUAL TABLE vec_articles_body USING vec0(
  │           embedding float[1024] distance_metric=cosine
  │         )
  │     └── CREATE TRIGGER articles_ai AFTER INSERT ON articles ...
  │     └── CREATE TRIGGER articles_au AFTER UPDATE ON articles ...
  │     └── CREATE TRIGGER articles_ad AFTER DELETE ON articles ...
  │
  └── sqlite-hybrid.createFTS5('articles', 'body')
        └── CREATE VIRTUAL TABLE fts_articles_body USING fts5(
              content=articles, content_rowid=rowid, body
            )
        └── CREATE TRIGGER fts_articles_ai AFTER INSERT ...
        └── CREATE TRIGGER fts_articles_au AFTER UPDATE ...
        └── CREATE TRIGGER fts_articles_ad AFTER DELETE ...
```

Inserts/updates enqueue raw text. Calling `search({ flush: true })` drains the queue synchronously — `sqlite-hybrid` computes embeddings for each pending entry and writes them to `vec0` before the search runs.

### Query Time

```
search("machine learning")
  │
  ├── 1. Embed query
  │     sqlite-hybrid embeds the query string
  │     → Float32Array[1024]
  │
  ├── 2. Vector search
  │     SELECT rowid, distance
  │     FROM vec_articles_body
  │     WHERE embedding MATCH ?
  │     ORDER BY distance
  │     LIMIT K
  │
  ├── 3. Keyword search (FTS5 BM25)
  │     SELECT rowid, rank
  │     FROM fts_articles_body
  │     WHERE body MATCH 'machine learning'
  │     ORDER BY rank
  │     LIMIT K
  │
  ├── 4. RRF Fusion
  │     score = 1/(60 + rank_vec) + 1/(60 + rank_fts)
  │     ORDER BY score DESC
  │
  ├── 5. Optional filter
  │     WHERE json_extract(doc, '$.year') = ?
  │
  └── 6. Join + return
        SELECT _id, doc, created_at, updated_at, score AS _score
        FROM articles
        JOIN results ON articles.rowid = results.rowid
        ORDER BY _score DESC
        LIMIT ?
```

## Limitations (MVP)

- Embedder model is configurable via `AnigoDB.connect({ embedding: { model } })` but limited to hf-embedder's supported models. No plugin system for fully custom embedders yet.
- No snippet/chunk highlighting in search results.
- No `$elemMatch` or array path indexing for RAG.
- `db.search()` returns all matching documents across collections in one flat list — no grouping.
- `createRAGIndex` only supports top-level and dot-path nested fields (`'address.city'`), not array expansion.
