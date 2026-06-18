# Getting Started

## Requirements

- **Node.js 20+**

## Installation

```bash
npm install anigodb
```

## Quick Start

```typescript
import { AnigoDB } from 'anigodb';

const db = AnigoDB.connect({
  path: './mydb.db',
  key: 'my-secret-passphrase',
});

const users = db.collection('users');

// Insert
const { insertedId } = users.insertOne({
  name: 'Alice',
  age: 30,
  skills: ['JavaScript', 'SQL'],
  createdAt: new Date(),
});

// Find
const alice = users.findOne({ name: 'Alice' });
// => { _id: '...', name: 'Alice', age: 30, skills: ['JavaScript', 'SQL'], createdAt: '2026-01-01T00:00:00.000Z' }

// Update
users.updateOne({ _id: insertedId }, { $set: { age: 31 } });

// Delete
users.deleteOne({ _id: insertedId });

db.close();
```

That's it. No schema, no migrations, no server. Collections are created lazily on first use.

## TypeScript

AnigoDB ships with TypeScript definitions. The `Collection<T>` generic infers document shape:

```typescript
interface User {
  name: string;
  age: number;
  skills: string[];
}

const users = db.collection<User>('users');
const user = users.findOne({ name: 'Alice' });
// user: User | null
```

## Data Types & Serialization

AnigoDB stores all documents as JSON text in SQLite. Certain JavaScript types are **automatically serialized** on insert and **deserialized** on read:

| JavaScript Type | Stored As | Round-Trip |
|---|---|---|
| `string` | JSON string | Exact |
| `number` | JSON number | Exact |
| `boolean` | JSON boolean | Exact |
| `null` | JSON `null` | Exact |
| `Date` | ISO 8601 string (`toISOString()`) | **Converted to string** — `findOne()` returns a string, not a `Date` |
| `Buffer` | **Rejected** — throws `TypeError` on insert | N/A |
| `undefined` | **Omitted** — field is dropped from the document | N/A |
| `function` | **Rejected** — throws `TypeError` on insert | N/A |
| `Symbol` | **Rejected** — throws `TypeError` on insert | N/A |

### Date Handling

`Date` objects are converted to ISO 8601 strings on insert (`new Date().toISOString()`). On read, they come back as plain strings — **not** `Date` instances. If you need a `Date` back, reconstruct it manually:

```typescript
const post = posts.findOne({ slug: 'hello-world' });
// post.createdAt => '2026-01-01T12:00:00.000Z'  (string)

// Reconstruct as Date
const createdAt = new Date(post.createdAt);
```

Querying on dates works as expected since ISO 8601 strings sort lexicographically:

```typescript
// All posts from January 2026 onwards
posts.find({ createdAt: { $gte: '2026-01-01T00:00:00.000Z' } });
```

### Buffer Rejection

`Buffer` values are **not supported**. Attempting to insert a document containing a `Buffer` field throws:

```typescript
users.insertOne({ avatar: Buffer.from('data') });
// TypeError: Unsupported type 'Buffer'. AnigoDB only supports JSON-serializable types.
```

If you need to store binary data, encode it as a base64 string first:

```typescript
users.insertOne({ avatar: Buffer.from('data').toString('base64') });
```

### Unencrypted Mode

By default, AnigoDB accepts an encryption `key` for SQLCipher v4 encryption. To create an **unencrypted** database (useful for development and debugging):

```typescript
const db = AnigoDB.connect({
  path: './dev.db',
  // No key provided — database is stored unencrypted
});
```

Unencrypted mode is discouraged in production. All data is stored as plaintext on disk and can be inspected with any SQLite tool (e.g., `sqlite3 mydb.db`).

## RAG Search Quick Start

```typescript
const articles = db.collection('articles');

articles.insertOne({ title: 'AI Advances', body: 'Deep learning is evolving rapidly.' });
articles.insertOne({ title: 'Database Internals', body: 'SQLite uses B-trees for storage.' });

// Create a RAG index — creates vector + FTS5 indexes automatically
articles.createRAGIndex('title');
articles.createRAGIndex('body');

// Wait for background embeddings to complete
articles.search('database storage', { flush: true });
// => [{ _id: '...', title: 'Database Internals', body: '...', _score: 0.85 }]

// Search across all collections
db.search('AI');
// => [{ _collection: 'articles', _id: '...', title: 'AI Advances', ... }]
```
