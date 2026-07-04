# Architecture

## Overview

AnigoDB is a thin wrapper around `better-sqlite3-multiple-ciphers` that presents a MongoDB-style document API. The core insight: **store each document as a JSON text blob in a single column, use SQLite's `json_extract()` functions for queries, and `json_set()` / `json_remove()` for updates.**

```
User Code
    │
    ├── CRUD ──────────────── RAG Search ────────
    │                              │
    ▼                              ▼
┌──────────────────────┐   ┌──────────────────────────┐
│   Collection<T>      │   │   Collection.search()    │
│   (insertOne, find,  │   │   Db.search()            │
│    updateOne, ...)   │   └────────────┬─────────────┘
└──────────────┬───────┘                │
               │ filter, update         │ query text
               ▼                        ▼
┌──────────────────────┐   ┌──────────────────────────────┐
│   Query Compiler     │   │  RagManager                  │
│   Update Compiler    │   │  (vec0 + FTS5, RRF fusion)   │
│   (all ops via SQL)  │   │  uses src/rrf.ts             │
└──────────────┬───────┘   └────────────┬─────────────────┘
               │                         │
               ▼                         ▼
┌────────────────────────────────────────────────────────┐
│  AnigoDB (Db)                                          │
│  Connection lifecycle, PRAGMAs, transactions           │
│  Wraps better-sqlite3-multiple-ciphers                 │
└────────────────────────┬───────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│  better-sqlite3-multiple-ciphers / sqlite-vec / FTS5   │
│  SQLCipher v4 + vector search + full-text search       │
└────────────────────────────────────────────────────────┘
```

### `_id` and rowid

The table uses `_id TEXT NOT NULL UNIQUE` instead of `TEXT PRIMARY KEY`. This preserves the implicit `rowid` column that `sqlite-hybrid`'s companion tables require for joining. From the user's perspective the behavior is identical (unique, indexed, fast lookups).

## File Layout

```
anigodb/
├── src/
│   ├── index.ts           # Public exports
│   ├── anigo-db.ts        # Db class (connect, transaction, collections)
│   ├── collection.ts      # Collection class (CRUD + search)
│   ├── query.ts           # Filter → SQL WHERE clause compiler
│   ├── update.ts          # Update operators → SQL expression compiler (all ops via json_set/json_remove)
│   ├── rrf.ts             # Standalone RRF fusion for hybrid search scoring
│   ├── object-id.ts       # ObjectId generator
│   ├── errors.ts          # Error classes (incl. RAGModelError)
│   ├── types.ts           # Public TypeScript types
│   └── rag.ts             # RagManager: embedder lifecycle, vec0 + FTS5 search, RAG index creation
├── test/
│   ├── anigo-db.test.ts
│   ├── collection.test.ts
│   ├── query.test.ts
│   ├── update.test.ts
│   └── rag.test.ts
├── docs/                  # Documentation
├── package.json
├── tsconfig.json          # ESM build config
├── tsconfig.cjs.json      # CJS build config
└── README.md
```

## Build

- **ESM**: `tsc` → `dist/esm/`
- **CJS**: `tsc --project tsconfig.cjs.json` → `dist/cjs/`
- Dual package via `package.json` `"exports"` field

## External Dependencies

| Package | Type | Purpose |
|---|---|---|
| `better-sqlite3-multiple-ciphers` | runtime | SQLite + SQLCipher v4 native addon |
| `sqlite-hybrid` | runtime | Vector + FTS5 hybrid search management |
| `hf-embedder` | runtime | HuggingFace ONNX model for text embeddings via Transformers.js — required |

Core CRUD only requires `better-sqlite3-multiple-ciphers`. `sqlite-hybrid` is always installed but RAG features are lazy — they only activate on `createRAGIndex` / `search` calls. `hf-embedder` is a required runtime dependency bundled with AnigoDB.

## Key Architecture

- **No `RAGProvider` interface** — `Collection` receives the `RagManager` instance directly from `AnigoDB`. The interface had exactly one adapter, providing no seam.
- **RRF fusion lives in `src/rrf.ts`** — The single module that implements Reciprocal Rank Fusion. `RagManager` imports it; `sqlite-hybrid` has its own internal copy (the dependency boundary).
- **All update operators compile to SQL** — Including `$push` and `$pull`, which use `json_each` and `json_group_array` to mutate arrays atomically. No read-then-write window, no in-memory serialization.
- **Search modes** — `hybrid` (default, RRF-fused vector + keyword), `vector` (semantic only), `keyword` (FTS5 only). `_score` is cosine similarity (0–1) for `hybrid` and `vector` modes.
- **Lazy model loading** — The ONNX embedding model loads on first actual `onEmbed` call (backfill, trigger, or search query), not at `connect()` or `createRAGIndex()`.

## Design Decision Record

| # | Decision | Rationale |
|---|---|---|
| 1 | Target Node.js 20+, dual ESM/CJS | Required by hf-embedder (ONNX/Transformers.js). |
| 2 | Database-level encryption (optional) | SQLCipher v4 for production, unencrypted mode for dev |
| 3 | sqlcipher4 default cipher | AES-256-XTS + per-page HMAC |
| 4 | `AnigoDB.connect()`-provided passphrase (optional) | Matches SQLCipher PRAGMA model; omit for dev |
| 5 | 4-column table schema | Fixed schema, all data in `doc` column |
| 6 | Db + Collection class architecture | MongoDB-style ergonomics |
| 7 | Synchronous API | SQLite is inherently synchronous |
| 8 | Expression indexes on json_extract | Fast queries without schema mutation |
| 9 | MongoDB-style ObjectId | Sortable, unique, no dependency |
| 10 | Lazy collection creation | Zero setup overhead |
| 11 | Array return from find() (no cursor) | Simpler than mutable cursor builder |
| 12 | Transaction support via db.transaction() | SQLite transactions are first-class |
| 13 | MongoDB-shaped results (matchedCount etc.) | Drop-in API familiarity |
| 14 | Date serialization (Date → ISO string) | Transparent round-trip |
| 15 | Buffer rejection | Keeps data model pure JSON |
| 16 | Limited aggregation (match/sort/skip/limit/count) | Covers 90% without pipeline engine |
| 17 | No raw SQLite access | Enforces API consistency |
| 18 | Node.js 20+ for all features. Core CRUD: dual ESM/CJS. RAG: ESM-only. | Required by hf-embedder (ONNX/Transformers.js). Node.js 20+ enforced uniformly. |
| 19 | sqlitecipher4 encryption + RAG coexist | same better-sqlite3 connection, encrypted companion tables |
| 20 | `_id TEXT NOT NULL UNIQUE` not PRIMARY KEY | Preserves rowid for sqlite-hybrid companion table joins |
| 21 | `createRAGIndex('field')` creates both vec0 + FTS5 | Hybrid search needs both vector and keyword indexes |
| 22 | `hf-embedder` as required runtime dependency | Shipped as part of the standard install; configurable model |
| 23 | Transparent model download (no explicit init) | RAG should "just work" on first createRAGIndex |
| 24 | Search modes: hybrid (default), vector, keyword | hybrid uses RRF fusion; vector = semantic only; keyword = FTS5 only (no model needed) |
| 25 | `_score` is cosine similarity (0–1) for hybrid/vector | Intuitive meaning: 87% = document is 87% semantically similar to query |
| 26 | All update operators (incl. $push/$pull) use SQL | Atomic operations via json_each/json_group_array; no read-then-write window |
| 27 | `:memory:` path rejected with `InvalidPathError` | sqlite-hybrid/vec0 require a real file path; in-memory mode is unsupported. Tests must use temporary file paths. |
