# API Reference

## `AnigoDB`

### `AnigoDB.connect(options: AnigoDBOptions): AnigoDB`

Creates and returns a new AnigoDB instance, opening or creating an encrypted SQLite database.

```typescript
interface EmbeddingOptions {
  /** HuggingFace model ID. Default: 'onnx-community/Qwen3-Embedding-0.6B-ONNX' */
  model?: string;
  /** Quantization. Default: 'q8' */
  dtype?: string;
  /** Execution device. Default: 'cpu' */
  device?: string;
  /** Pooling strategy. Default: 'mean' */
  pooling?: 'mean' | 'last_token';
  /** Vector dimension. Auto-detected from model if omitted. */
  vectorSize?: number;
}

interface AnigoDBOptions {
  path: string;
  /** Encryption passphrase. Omit for unencrypted mode (development only). */
  key?: string;
  /** Cipher to use. Default: 'sqlcipher4' */
  cipher?: string;
  /** KDF iterations. Default: 256000 */
  kdfIter?: number;
  /** WAL mode. Default: true */
  wal?: boolean;
  /** Busy timeout in ms. Default: 5000 */
  busyTimeout?: number;
  /** Synchronous mode. Default: 'normal' */
  synchronous?: 'off' | 'normal' | 'full';
  /** Cache size in KB. Default: 64000 */
  cacheSize?: number;
  /** Custom ObjectId generator */
  objectId?: () => string;
  /** Embedding model configuration for RAG features. */
  embedding?: EmbeddingOptions;
}
```

### `db.collection<T>(name: string): Collection<T>`

Returns a `Collection` handle for the given name. Does **not** create the SQLite table until the first write operation. This is lazy — calling `collection()` is cheap.

### `db.transaction<T>(fn: () => T): T`

Runs a function inside a SQLite transaction. Auto-commits on success, auto-rollbacks on throw. Nested transactions use SQLite savepoints.

```typescript
db.transaction(() => {
  users.insertOne({ name: 'Bob' });
  posts.insertOne({ title: 'Hello', author: 'Bob' });
});
```

### `db.search<T = any>(query: string, options?: SearchOptions): SearchResult<T>[]`

Searches across **all collections** with at least one RAG index. Results include a `_collection` field. Delegates to `sqlite-hybrid`'s global `hybridSearch()`. See `Collection.search()` for option details.

```typescript
const results = db.search('meeting notes', { limit: 5 });
// results[0] => { _collection: 'notes', _id: '...', title: '...', _score: 0.85 }
```

### `db.close(): void`

Closes the database connection. Should be called before process exit for clean WAL checkpointing.

### `db.raw: Database | undefined`

**Not exposed** — AnigoDB does not expose the underlying `better-sqlite3-multiple-ciphers` instance. All database operations go through the AnigoDB API.

---

## `Collection<T>`

### `insertOne(doc: OptionalId<T>): InsertOneResult`

```typescript
interface InsertOneResult {
  acknowledged: true;
  insertedId: string;
}
```

Omitting `_id` auto-generates an ObjectId (hex string, 24 characters). Providing `_id` uses your value. Throws `DuplicateKeyError` if `_id` already exists.

**Type restrictions:** `Buffer`, `function`, and `Symbol` values are rejected with `TypeError`. `undefined` fields are silently omitted. `Date` objects are serialized to ISO 8601 strings. See [Getting Started — Data Types & Serialization](01-getting-started.md#data-types--serialization) for details.

### `insertMany(docs: OptionalId<T>[]): InsertManyResult`

```typescript
interface InsertManyResult {
  acknowledged: true;
  insertedIds: string[];
}
```

All inserts run inside a single transaction. If any insert fails, the entire batch is rolled back.

### `findOne(filter: Filter<T>, options?: FindOneOptions): T | null`

```typescript
interface FindOneOptions {
}
```

Returns the first matching document, or `null`. The optional `sort` determines which document is "first".

**Note:** `Date` fields are returned as ISO 8601 strings, not `Date` instances. Reconstruct with `new Date(doc.field)`.

### `find(filter: Filter<T>, options?: FindOptions): T[]`

```typescript
interface FindOptions {
}
```

Returns an array (possibly empty) of matching documents.

### `updateOne(filter: Filter<T>, update: Update<T>, options?: UpdateOptions): UpdateResult`

```typescript
interface UpdateOptions {
  upsert?: boolean;
}

interface UpdateResult {
  acknowledged: true;
  matchedCount: number;
  modifiedCount: number;
  upsertedId: string | null;
}
```

Updates the **first** matching document. Does **not** throw if no document matches — returns `matchedCount: 0`.

### `updateMany(filter: Filter<T>, update: Update<T>): UpdateResult`

Same return shape as `updateOne`. Updates all matching documents.

### `deleteOne(filter: Filter<T>): DeleteResult`

```typescript
interface DeleteResult {
  acknowledged: true;
  deletedCount: number;
}
```

Deletes the **first** matching document. Returns `deletedCount: 0` when nothing matches.

### `deleteMany(filter: Filter<T>): DeleteResult`

Deletes all matching documents.

### `countDocuments(filter: Filter<T>): number`

Returns the exact count of documents matching the filter. Uses `SELECT COUNT(*)` — always accurate.

### `findOneAndUpdate(filter: Filter<T>, update: Update<T>, options?: FindOneAndUpdateOptions): T | null`

```typescript
interface FindOneAndUpdateOptions {
}
```

Atomically finds and updates a document in a single transaction. Returns the document before or after modification.

### `findOneAndDelete(filter: Filter<T>, options?: FindOneAndDeleteOptions): T | null`

```typescript
interface FindOneAndDeleteOptions {
}
```

Atomically finds and deletes a document. Returns the deleted document.

### `findOneAndReplace(filter: Filter<T>, replacement: T, options?: FindOneAndReplaceOptions): T | null`

```typescript
interface FindOneAndReplaceOptions {
}
```

Atomically finds a document and **replaces** it entirely (not a partial update). The replacement document's `_id` must match the found document (or be omitted).

### `createIndex(spec: IndexSpec): string`

```typescript
type IndexSpec = Record<string, 1 | -1>;
```

Creates an expression index on JSON paths:

```typescript
users.createIndex({ 'profile.role': 1 });
// => CREATE INDEX idx_users_profile_role
//    ON users(json_extract(doc, '$.profile.role'))
```

Returns the generated index name. Multiple calls with the same spec are idempotent (`IF NOT EXISTS`).

Compound indexes:

```typescript
users.createIndex({ age: 1, name: 1 });
```

### `dropIndex(name: string): void`

Drops an index by name.

### `aggregate<T = any>(pipeline: Stage[]): T[]`

Supported pipeline stages:
- `{ $match: Filter }` — filter documents
- `{ $sort: Sort }` — sort documents
- `{ $skip: number }` — skip N documents
- `{ $limit: number }` — limit to N documents
- `{ $count: string }` — count and return `{ [field]: number }`

### `createRAGIndex(field: string): void`

Creates a RAG index on a document field. This call is **synchronous** — it returns only after the vector index (`vec0` virtual table via sqlite-vec) and the FTS5 index have been created in SQLite. The first call to `createRAGIndex` initializes the embedder (downloading the model from Hugging Face if not cached). All embedding work is handled transparently by `sqlite-hybrid`.

```typescript
articles.createRAGIndex('title');
// Creates: vec_articles_title (vector index)
//          fts_articles_title (FTS5 index)
// Returns only after both indexes exist.
```

The indexed field value is extracted from the `doc` column via `json_extract()`. Arrays and objects are JSON-stringified before embedding. Documents inserted after the index is created are enqueued internally; call `search` with `{ flush: true }` to ensure all pending embeddings are written before querying.

The embedding model is initialized on first `createRAGIndex()` call. Configure via `AnigoDB.connect({ embedding: { model, dtype, device, pooling, vectorSize } })`. Throws `RAGModelError` if the embedder fails to initialize.

### `search(query: string, options?: SearchOptions): SearchResult<T>[]`

```typescript
interface SearchOptions {
  limit?: number;           // default: 10
  filter?: Filter<T>;       // structured filter applied to the search
  flush?: boolean;          // wait for pending embeddings before searching (default: false)
}

interface SearchResult<T> {
  _score: number;           // RRF-fused relevance score (0-1)
  _collection?: string;     // present only in db.search() results
}
```

**Synchronous.** Performs **hybrid search** — embeds the query, runs vector and FTS5 searches, and returns results sorted by descending `_score`, all in a single blocking call.

```typescript
// Pure semantic + keyword search
articles.search('machine learning');
// => [{ _score: 0.92, title: 'AI Advances', ... }, ...]

// With structured filter
articles.search('budget report', { filter: { year: 2026 }, limit: 5 });

// Wait for pending embeddings
articles.search('new document', { flush: true });
```

```typescript
const results = db.search('meeting notes');
// results[0] => { _collection: 'notes', _id: '...', title: '...', _score: 0.78 }
```

### `collectionName: string`

Read-only property returning the collection name.
