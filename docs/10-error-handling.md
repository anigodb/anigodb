# Error Handling

AnigoDB mirrors MongoDB error semantics while using custom error classes for clear differentiation.

## Error Classes

### `AnigoError`

Base error class for all AnigoDB errors. Extends `Error`.

```typescript
import { AnigoError } from 'anigodb';

try {
  users.insertOne({ ... });
} catch (err) {
  if (err instanceof AnigoError) {
    // Known error from AnigoDB
  }
}
```

### `DuplicateKeyError`

Thrown when an insert or upsert violates the unique `_id` constraint:

```typescript
import { DuplicateKeyError } from 'anigodb';

try {
  users.insertOne({ _id: 'existing-id', name: 'Alice' });
} catch (err) {
  if (err instanceof DuplicateKeyError) {
    console.log(err.message);
    // "_id 'existing-id' already exists in collection 'users'"
  }
}
```

## Return Shapes (Non-Throwing)

These operations never throw on "not found" — they return structured results:

| Operation | Not Found | Success |
|---|---|---|
| `findOne` | `null` | `T` |
| `find` | `[]` | `T[]` |
| `countDocuments` | `0` | `number` |
| `updateOne` | `{ matchedCount: 0, modifiedCount: 0, upsertedId: null }` | full result |
| `updateMany` | `{ matchedCount: 0, modifiedCount: 0, upsertedId: null }` | full result |
| `deleteOne` | `{ deletedCount: 0 }` | full result |
| `deleteMany` | `{ deletedCount: 0 }` | full result |

## Throwing Operations

| Operation | throws when |
|---|---|---|
| `AnigoDB.connect` | `path: ':memory:'` → `InvalidPathError` |
| `insertOne` | duplicate `_id` → `DuplicateKeyError`; `Buffer`/`function`/`Symbol` in doc → `TypeError` |
| `insertMany` | any duplicate `_id` in batch (full rollback) |
| `updateOne` with `upsert: true` | duplicate `_id` during insert |
| `findOneAndUpdate` | same as upsert conditions |
| `createIndex` | invalid path / database error |
| `createRAGIndex` | model download failure → `RAGModelError` |
| `search` | model not yet initialized → `RAGModelError` |
| `db.transaction` | any error inside the function (propagated) |

### `TypeError`

The built-in JavaScript `TypeError` is thrown when a document contains unsupported types:

- `Buffer` → rejected with `TypeError`
- `function` → rejected with `TypeError`
- `Symbol` → rejected with `TypeError`
- `undefined` → field silently omitted (no error)

See [Getting Started — Data Types & Serialization](01-getting-started.md#data-types--serialization) for details.

### `InvalidPathError`

Thrown when `AnigoDB.connect` is called with `path: ':memory:'`. In-memory databases are not supported — use a file path instead. For testing, create a temporary persistent database and remove it after the test.

```typescript
import { InvalidPathError } from 'anigodb';

// This throws:
AnigoDB.connect({ path: ':memory:' });
// => InvalidPathError: "':memory:' is not supported. AnigoDB requires a file path. Use a temporary file path for testing."

// Correct usage in tests:
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

const dbPath = join(tmpdir(), `test-${Date.now()}.db`);
const db = AnigoDB.connect({ path: dbPath });
// ... run tests ...
db.close();
rmSync(dbPath, { force: true });
```

### `RAGModelError`

Thrown when the embedding model fails to download or initialize:

```typescript
import { RAGModelError } from 'anigodb';

try {
  articles.createRAGIndex('body');
} catch (err) {
  if (err instanceof RAGModelError) {
    console.log(err.message);
    // "Failed to initialize embedding model. Check network connectivity and disk space. (original cause: ...)"
  }
}
```

This error may also be thrown by `search()` if the model download has not completed and the synchronous embedder is unavailable. Retry after resolving the network/disk issue.

## Errors from `better-sqlite3-multiple-ciphers`

Raw SQLite errors (corrupt database, invalid key, disk full, SQL logic errors) are wrapped in `AnigoError`:

```typescript
try {
  const db = AnigoDB.connect({ path: './db.db', key: 'wrong-key' });
} catch (err) {
  // AnigoError: 'database is malformed' (from SQLCipher HMAC validation failure)
}
```

The original SQLite error message is preserved in the error message. The `cause` property contains the original error when available.
