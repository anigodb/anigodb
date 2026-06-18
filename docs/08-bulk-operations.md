# Bulk Operations

## `insertMany`

Insert multiple documents atomically:

```typescript
const { insertedIds } = users.insertMany([
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 },
  { name: 'Charlie', age: 35 },
]);
// insertedIds: string[] — each auto-generated ObjectId or provided _id
```

All inserts run inside a `BEGIN...COMMIT` transaction. If any insert fails (e.g., duplicate `_id`), the entire batch is rolled back.

## `updateMany`

Update all documents matching a filter:

```typescript
const result = users.updateMany(
  { role: 'trial' },
  { $set: { role: 'expired' }, $inc: { loginCount: 1 } }
);
// result.matchedCount: number of documents matching the filter
// result.modifiedCount: number of documents actually changed
```

Uses individual `UPDATE` statements inside a transaction. Each document is updated via a single SQL `json_set()` expression.

## `deleteMany`

Delete all documents matching a filter:

```typescript
const result = users.deleteMany({ status: 'inactive' });
// result.deletedCount: number of documents removed
```

Runs `DELETE FROM collection WHERE <filter>` — a single SQL statement.

## `bulkWrite` (Future)

Not available in MVP. Will support ordered/unordered mode with mixed `insertOne`, `updateOne`, `deleteOne`, `replaceOne` operations.
