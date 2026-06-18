# Aggregation

AnigoDB's aggregation pipeline is intentionally limited in MVP. It supports the most common stages — enough to replace the common MongoDB aggregation use cases without implementing a full pipeline engine.

## Supported Stages

### `$match`

Filters documents — same semantics as `find()`:

```typescript
users.aggregate([
  { $match: { age: { $gte: 21 } } },
]);
```

Equivalent to `users.find({ age: { $gte: 21 } })`. Translated to SQL `WHERE` clause.

### `$sort`

Sorts documents — same semantics as `find()` options:

```typescript
users.aggregate([
  { $match: { role: 'admin' } },
  { $sort: { name: 1 } },
]);
```

Translated to SQL `ORDER BY json_extract(doc, '$.name') ASC`.

### `$skip`

Skips N documents:

```typescript
users.aggregate([
  { $sort: { name: 1 } },
  { $skip: 10 },
]);
```

Translated to SQL `LIMIT -1 OFFSET 10`.

The stage order in the pipeline determines SQL clause order: `MATCH → SORT → SKIP → LIMIT`.

### `$limit`

Limits to N documents:

```typescript
users.aggregate([
  { $sort: { createdAt: -1 } },
  { $limit: 5 },
]);
```

Translated to SQL `LIMIT 5`.

### `$count`

Counts documents and returns the result as a document:

```typescript
users.aggregate([
  { $match: { role: 'admin' } },
  { $count: 'totalAdmins' },
]);
// => [{ totalAdmins: 42 }]
```

Translated to `SELECT COUNT(*) AS totalAdmins FROM ...`. `$count` must be the final stage in the pipeline.

## Stage Order

Only one ordering is allowed and it must follow the pipeline sequence. The stage order matters:

```typescript
// Correct: match first, then sort, then limit
users.aggregate([
  { $match: { active: true } },
  { $sort: { name: 1 } },
  { $limit: 10 },
]);
```

## Return Type

`aggregate<T>()` returns `T[]`. The type parameter defaults to `any` but can be specified:

```typescript
interface CountResult { totalAdmins: number; }
const [result] = users.aggregate<CountResult>([
  { $match: { role: 'admin' } },
  { $count: 'totalAdmins' },
]);
// result: CountResult
```

## Not Supported (Phase 2)

- `$group` — aggregation functions (SUM, AVG, MIN, MAX, etc.)
- `$lookup` — SQL JOIN equivalent
- `$unwind` — array expansion
- `$project` — field reshaping (use `projection` in `find()`)
- `$bucket`, `$facet`, `$addFields`, `$replaceRoot`
