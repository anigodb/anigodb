# FAQ

## Why not just use MongoDB?

MongoDB requires a server process, network connection, authentication infrastructure, and operational overhead. AnigoDB is a library — `npm install`, write code, ship. No servers, no config files, no daemons.

## Why not just use `better-sqlite3` directly?

`better-sqlite3` is a raw SQLite driver. You write SQL. You manage schemas. You serialize/deserialize JSON yourself. AnigoDB provides a MongoDB-like document API on top — query operators, update operators, indexes on JSON paths, ObjectId generation, transactions — without writing a single SQL statement.

## How does this compare to `nedb` / `nedb-promises`?

`nedb` stores each document as a line in a file — no encryption, no indexing via SQLite, no WAL, no transactions. `nedb` is also unmaintained. AnigoDB uses SQLite as its storage engine, inheriting ACID guarantees, crash safety, expression indexes, and encryption.

## What about `sql.js`?

`sql.js` is SQLite compiled to WASM — runs in the browser or Node.js but has no native module, no WAL mode support, and file sizes can exceed native Node.js addons. `better-sqlite3-multiple-ciphers` is a native Node.js addon that supports the full SQLite feature set including WAL and encryption.

## Is this a MongoDB-compatible server replacement?

No. AnigoDB implements the MongoDB **query API syntax** but does not speak the MongoDB wire protocol. You cannot point a MongoDB driver at it. It is an embedded database with MongoDB-like ergonomics.

## What happens if the database file is corrupted?

SQLCipher v4 detects corruption via per-page HMAC. AnigoDB does not add corruption recovery beyond what SQLite provides (`PRAGMA integrity_check`, `PRAGMA quick_check`). Backup your database files regularly.

## Can I use AnigoDB in the browser?

No. `better-sqlite3-multiple-ciphers` is a native Node.js addon. It cannot run in browser environments or Deno without Node-API compatibility.

## Can I have multiple database files open?

Yes. Each `AnigoDB.connect({ path, key })` opens an independent SQLite database. You can open as many as your file system allows.

## How do I migrate from an older version of AnigoDB?

AnigoDB has no built-in migration system. Since it is schemaless, migration typically means:
1. Open the old database
2. Read and transform documents
3. Write to a new database

If the on-disk format changes between versions, the documentation will provide explicit migration steps.

For encrypted databases, pass the old database's `key` to `AnigoDB.connect` when reading, and the new database's `key` when writing.

## Can I use raw SQL?

No. AnigoDB does not expose the underlying SQLite connection. All database access goes through the MongoDB-style API. If you need raw SQL, use `better-sqlite3-multiple-ciphers` directly.

## What is RAG search and how does it work in AnigoDB?

RAG (Retrieval-Augmented Generation) search combines **vector semantic search** with **keyword search** (FTS5). `createRAGIndex('field')` creates both a `vec0` vector table (via sqlite-vec) and an FTS5 index on the same field. When you call `search("query")`, AnigoDB embeds the query text using a local HuggingFace ONNX model, searches the vector index for semantically similar documents, performs keyword matching via FTS5, and fuses the results via Reciprocal Rank Fusion (RRF).

## Does AnigoDB require internet for RAG features?

Only the first time. The embedding model is downloaded from Hugging Face on first `createRAGIndex()` call and cached to `~/.hfembedder/.cache/models/`. Subsequent runs are fully offline.

## What embedding model does AnigoDB use?

Default: `Qwen3-Embedding-0.6B` quantized to q8 via ONNX (via `hf-embedder`). Output dimension: 1024. Context window: 32K tokens. Customizable via `AnigoDB.connect({ embedding: { model: '...' } })`.

## Can I use a different embedding model?

Yes. Pass any HuggingFace ONNX embedding model ID to the `embedding` config option:

```typescript
const db = AnigoDB.connect({
  path: './db.db',
  embedding: { model: 'Xenova/multilingual-e5-small' }
});
```

## Does RAG search work in encrypted databases?

Yes. `sqlite-hybrid` operates on the same `better-sqlite3-multiple-ciphers` connection, so companion tables (`vec0`, FTS5) inherit the same encryption layer.

## Is `hf-embedder` required?

Yes. `hf-embedder` is a required runtime dependency bundled with AnigoDB:

```bash
npm install anigodb
```

Core CRUD, indexes, expression indexes, and aggregation do not use the embedder actively, but it must be present. RAG features (`createRAGIndex()`, `search()`, `db.search()`) use it to embed text.
