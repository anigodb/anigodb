# Transactions

SQLite transactions are embedded directly into AnigoDB's API. They are **synchronous** and **free** — there is no network round-trip or connection pool.

## `db.transaction(fn)`

Wraps a function in `BEGIN` → `COMMIT` (or `ROLLBACK` on error):

```typescript
const db = AnigoDB.connect({ path: './db.db', key: 'secret' });
const accounts = db.collection('accounts');

db.transaction(() => {
  accounts.updateOne({ name: 'Alice' }, { $inc: { balance: -100 } });
  accounts.updateOne({ name: 'Bob' }, { $inc: { balance: 100 } });
});
// If either update fails, both are rolled back
```

### Return value

```typescript
const result = db.transaction(() => {
  accounts.insertOne({ name: 'Charlie' });
  return accounts.findOne({ name: 'Charlie' });
});
// result contains the inserted document
```

### Error handling

Any exception inside the transaction triggers `ROLLBACK` and the error propagates:

```typescript
try {
  db.transaction(() => {
    accounts.insertOne({ _id: '1', name: 'Alice' });
    accounts.insertOne({ _id: '1', name: 'Bob' }); // duplicate _id!
  });
} catch (err) {
  // Transaction rolled back. Alice is NOT in the database.
  console.log(err); // DuplicateKeyError
}
```

## Nested Transactions

Nested `db.transaction()` calls use SQLite **savepoints**:

```typescript
db.transaction(() => {
  accounts.insertOne({ name: 'Outer' });
  db.transaction(() => {
    accounts.insertOne({ name: 'Inner' });
  }); // savepoint release
}); // outer commit
```

If the inner transaction fails, only the inner work is rolled back (to the savepoint). If the outer transaction fails, everything rolls back.

## Implicit Transactions

Single-document operations (`insertOne`, `updateOne`, `deleteOne`, `findOneAndUpdate`, etc.) are implicitly atomic — SQLite wraps each statement in an auto-transaction.

## `updateMany` / `deleteMany`

These wrap their loop in `BEGIN...COMMIT`. If the operation fails mid-way, all changes up to that point are rolled back.
