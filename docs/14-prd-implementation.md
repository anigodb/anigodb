# PRD: AnigoDB Library Implementation

## Problem Statement

AnigoDB is specified in 14 documentation files but has no source code. Developers cannot install, import, or use it. The documented API surface (CRUD, query operators, update operators, indexes, transactions, aggregation, encryption, RAG search) exists only as prose and TypeScript snippets.

## Solution

Build the AnigoDB library from the documented spec. Deliver a `npm install anigodb` experience matching all docs.

## User Stories

1. As a Node.js developer, I want to `npm install anigodb` and open a database with one `AnigoDB.connect()` call, so that I can start persisting data immediately.
2. As a developer, I want to create collections lazily without schema definitions, so that I can prototype quickly.
3. As a developer, I want to `insertOne`/`insertMany` documents with auto-generated ObjectId `_id`, so that every document is uniquely identifiable.
4. As a developer, I want `findOne`/`find` with MongoDB-style filters (`$eq`, `$gt`, `$in`, `$regex`, `$and`/`$or`/`$not`), so that I can query documents without writing SQL.
5. As a developer, I want `updateOne`/`updateMany` with operators (`$set`, `$unset`, `$inc`, `$push`, `$pull`, `$rename`), so that I can mutate documents atomically.
6. As a developer, I want `deleteOne`/`deleteMany` with filters, so that I can remove documents matching conditions.
7. As a developer, I want `findOneAndUpdate`/`findOneAndDelete`/`findOneAndReplace` in a single atomic operation, so that I can read-and-modify without race conditions.
8. As a developer, I want `countDocuments` with filters, so that I can know collection size accurately.
9. As a developer, I want `createIndex` on JSON paths (single and compound), so that frequent queries are fast.
10. As a developer, I want `dropIndex` by name, so that I can remove unused indexes.
11. As a developer, I want `db.transaction()` with BEGIN/COMMIT/ROLLBACK and nested savepoints, so that multi-document operations are atomic.
12. As a developer, I want `aggregate` with `$match`/`$sort`/`$skip`/`$limit`/`$count` stages, so that I can perform common data transformations.
13. As a developer, I want optional SQLCipher v4 encryption via `key` in connection options, so that data at rest is encrypted.
14. As a developer, I want unencrypted mode by omitting `key`, so that development and debugging are simple.
15. As a developer, I want custom cipher configuration (`cipher`, `kdfIter`), so that I can use chacha20 or tune KDF iterations.
16. As a developer, I want custom ObjectId generator via `objectId` option, so that I can use UUIDs or other ID schemes.
17. As a developer, I want `Date` objects auto-serialized to ISO 8601 strings on insert and returned as strings on read, so that date handling is predictable.
18. As a developer, I want `Buffer`/`function`/`Symbol` fields rejected with `TypeError` on insert, so that the data model stays JSON-pure.
19. As a developer, I want `undefined` fields silently omitted on insert, so that partial document shapes don't break serialization.
20. As a developer, I want WAL mode, configurable `busyTimeout`, `synchronous`, and `cacheSize`, so that I can tune performance.
21. As a developer, I want `db.close()` for clean WAL checkpointing, so that no data is lost on exit.
 22. As a developer, I want `createRAGIndex(field)` to create vec0 + FTS5 indexes and download the embedding model on first call, so that hybrid search works out of the box.
23. As a developer, I want `search(query)` performing hybrid (vector + FTS5) search fused via RRF, so that I get relevant results without choosing search strategy.
24. As a developer, I want `search(query, { filter })` with structured filters applied after RRF fusion, so that I can combine semantic and structured queries.
25. As a developer, I want `search(query, { flush: true })` to block until pending embeddings complete, so that I get strong consistency when needed.
26. As a developer, I want `db.search(query)` across all collections with RAG indexes, returning `_collection` field, so that I can search my entire database.
27. As a developer, I want `DuplicateKeyError` thrown on duplicate `_id`, so that I can handle conflicts explicitly.
28. As a developer, I want `RAGModelError` for RAG model failures and `InvalidPathError` when `:memory:` is passed as `path`, so that I can provide user-friendly error messages.
29. As a developer, I want update/delete operations returning `matchedCount`/`modifiedCount`/`deletedCount` (never throw on no match), so that I can check operation results without try/catch.
30. As a developer, I want TypeScript generics (`Collection<User>`) so that documents are type-checked.
31. As a developer, I want dual ESM/CJS package exports, so that I can import regardless of module system.
32. As a developer, I want `db.raw` NOT exposed, so that the MongoDB-style API contract is enforced.

## Implementation Decisions

### Architecture

- `AnigoDB (Db)` class wraps `better-sqlite3-multiple-ciphers` connection. Single connection per instance — synchronous API.
- `Collection<T>` class created lazily by `db.collection(name)`. Does not create SQLite table until first write.
- Table schema per collection: `_id TEXT NOT NULL UNIQUE`, `doc TEXT`, `created_at TEXT`, `updated_at TEXT`.
- `_id` uses `UNIQUE` not `PRIMARY KEY` — preserves implicit `rowid` for `sqlite-hybrid` companion table joins.
- ObjectId default: 24-char hex string (timestamp + random + counter). Customizable via `objectId` option.
- Query operators compile filter objects to SQL `WHERE` clauses with `json_extract()`.
- Update operators compile to SQL `json_set()`/`json_remove()` expressions. `$push`/`$pull` require JS read-modify-write inside a transaction.
- `$push`/`$pull` run as JS mutation before SQL update. Operator evaluation order: push/pull → unset → rename → set/inc.
- `$regex` requires registering a `regexp()` function on the connection via `db.function('regexp', (pattern, value) => new RegExp(pattern).test(value))`.

### Encryption

- `key` optional. When provided, set SQLCipher PRAGMAs before any other operation. When omitted, skip all cipher PRAGMAs — plain SQLite.
- Default cipher: `sqlcipher4` (AES-256-XTS + per-page HMAC-SHA512). Default KDF iterations: 256000.
- Key rotation not supported. Migration script approach: read old DB, write to new DB with new key.
- Encrypted WAL pages are also encrypted. Backup inherits encryption.

### Configuration

Connection options with defaults:

| Option | Type | Default |
|---|---|---|
| `path` | `string` | required |
| `key` | `string` | optional (unencrypted) |
| `cipher` | `string` | `'sqlcipher4'` |
| `kdfIter` | `number` | `256000` |
| `wal` | `boolean` | `true` |
| `busyTimeout` | `number` | `5000` |
| `synchronous` | `'off'\|'normal'\|'full'` | `'normal'` |
| `cacheSize` | `number` | `64000` |
| `objectId` | `() => string` | internal ObjectId |
| `embedding` | `EmbeddingOptions` | optional (RAG works with defaults) |
| `embedding.model` | `string` | `'onnx-community/Qwen3-Embedding-0.6B-ONNX'` |
| `embedding.dtype` | `string` | `'q8'` |
| `embedding.device` | `string` | `'cpu'` |
| `embedding.pooling` | `'mean' \| 'last_token'` | `'mean'` |
| `embedding.vectorSize` | `number` | auto-detected |

### Aggregation

Limited to 5 stages — no pipeline engine. Each stage maps directly to SQL clause:

- `$match` → `WHERE`
- `$sort` → `ORDER BY`
- `$skip` → `LIMIT -1 OFFSET N`
- `$limit` → `LIMIT N`
- `$count` → `SELECT COUNT(*) AS name`
- Stage order in pipeline must be match → sort → skip → limit. `$count` must be final.

### RAG Search

- `createRAGIndex(field)` calls `sqlite-hybrid` to create vec0 virtual table + FTS5 virtual table + triggers.
- First call downloads the embedding model from Hugging Face. Default: Qwen3-Embedding-0.6B ONNX (~600MB). Cached to `~/.hfembedder/.cache/models/`.
- Embeddings computed asynchronously via background poller. `search({ flush: true })` blocks until pending embeddings complete.
- Hybrid search: embed query → vec0 search (cosine distance) + FTS5 search (BM25) → RRF fusion → optional structured filter → return results.
- RRF constant: `k = 60`. Score = `1/(60 + rank_vec) + 1/(60 + rank_fts)`.
- `db.search()` iterates all collections with RAG indexes, runs hybrid search on each, concatenates and sorts by `_score`.
- `hf-embedder` is a required runtime dependency. `createRAGIndex`/`search` throw `RAGModelError` if the model fails to initialize.

### Error Classes

| Class | Extends | When thrown |
|---|---|---|
| `AnigoError` | `Error` | Base class; raw SQLite errors wrapped |
| `DuplicateKeyError` | `AnigoError` | Duplicate `_id` on insert/upsert |
| `InvalidPathError` | `AnigoError` | `path: ':memory:'` passed to `AnigoDB.connect` |
| `RAGModelError` | `AnigoError` | Model download/init failure |
| `TypeError` (built-in) | — | `Buffer`/`function`/`Symbol` in document |

### Build

- ESM: `tsc` → `dist/esm/`
- CJS: `tsc --project tsconfig.cjs.json` → `dist/cjs/`
- Dual package via `package.json` `"exports"` field
- Target Node.js 20+. Required by `hf-embedder` (ONNX/Transformers.js).
- Module files per architecture.md layout: `anigo-db.ts`, `collection.ts`, `query.ts`, `update.ts`, `projection.ts`, `object-id.ts`, `errors.ts`, `rag.ts`, `types.ts`, `index.ts`.

### Dependencies

| Package | Type | Purpose |
|---|---|---|
| `better-sqlite3-multiple-ciphers` | runtime | SQLite + SQLCipher v4 |
| `sqlite-hybrid` | runtime | Vector + FTS5 hybrid search |
| `hf-embedder` | runtime | Text embeddings via Transformers.js (configurable model) — required |
| `typescript` | dev | Build |
| `vitest` or `node:test` | dev | Testing |

## Testing Decisions

**What makes a good test:** Test external behavior (return values, thrown errors, persisted state) — not internal SQL generation. For example, test that `findOne({ age: { $gt: 21 } })` returns the matching document, not that it generated `WHERE json_extract(doc, '$.age') > ?`.

**Modules to test:**

| Test file | Seam | DB strategy |
|---|---|---|
| `test/query.test.ts` | QueryCompiler — pure fn | No DB needed |
| `test/update.test.ts` | UpdateCompiler — pure fn | No DB needed |
| `test/collection.test.ts` | Collection CRUD — insert, find, update, delete, findOneAnd* | temp file (deleted after test) |
| `test/db.test.ts` | Db connection, options, transaction, close, unencrypted mode | temp file (deleted after test) |
| `test/rag.test.ts` | RAG — createRAGIndex, search, flush, cross-collection | temp file directory |

**Prior art:** Docs describe expected behavior precisely — test cases derive from examples in `01-getting-started.md`, `02-api-reference.md`, `03-query-operators.md`, `04-update-operators.md`. For RAG tests, test FTS5-only path (no embedding dependency) with mock or conditional skip. Full RAG integration tests require `hf-embedder` installed.

## Out of Scope

- `bulkWrite` with ordered/unordered mode (future — listed in docs)
- Aggregation `$group`/`$lookup`/`$unwind`/`$project`/`$bucket`/`$facet`/`$addFields`/`$replaceRoot` (Phase 2 per docs)
- Fully custom embedder plugin system (future — `hf-embedder` with configurable model in MVP)
- Snippet/chunk highlighting in search results (MVP limitation)
- `$elemMatch` or array path indexing for RAG (MVP limitation)
- Browser/Deno support (native addon)
- Migration system between versions
- Raw SQL access (`db.raw` not exposed)
- Corruption recovery beyond SQLite `PRAGMA integrity_check`
- Performance benchmarks (to be added after implementation)

## Further Notes

- `hf-embedder` is a required runtime dependency — bundled with AnigoDB (`npm install anigodb`).
- `:memory:` database paths are not supported. `AnigoDB.connect({ path: ':memory:' })` throws `InvalidPathError`. All tests must use temporary file paths, cleaned up after each test run.
- The 14th doc (`docs/14-prd-implementation.md`) is this PRD. Version numbering should align doc #14 as implementation plan.
- The docs review (Issues 1-6) is already applied to all doc files. Source implementation must match the corrected docs, not the pre-fix versions.
- Export all public types (`AnigoDBOptions`, `Filter`, `Update`, `InsertOneResult`, `UpdateResult`, `DeleteResult`, `SearchOptions`, `SearchResult`, error classes: `AnigoError`, `DuplicateKeyError`, `InvalidPathError`, `RAGModelError`) from `index.ts`.
