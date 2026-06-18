# Query Operators

AnigoDB translates MongoDB-style filter objects into SQL `WHERE` clauses using `json_extract()`.

## Comparison

| Operator | SQL Translation | Example |
|---|---|---|
| `$eq` | `json_extract(doc, '$.field') = ?` | `{ age: { $eq: 30 } }` |
| `$ne` | `json_extract(doc, '$.field') != ?` | `{ age: { $ne: 30 } }` |
| `$gt` | `json_extract(doc, '$.field') > ?` | `{ age: { $gt: 21 } }` |
| `$gte` | `json_extract(doc, '$.field') >= ?` | `{ age: { $gte: 21 } }` |
| `$lt` | `json_extract(doc, '$.field') < ?` | `{ age: { $lt: 65 } }` |
| `$lte` | `json_extract(doc, '$.field') <= ?` | `{ age: { $lte: 65 } }` |

Shorthand — `{ field: value }` is equivalent to `{ field: { $eq: value } }`.

## Array

| Operator | SQL Translation | Example |
|---|---|---|
| `$in` | `json_extract(doc, '$.field') IN (?, ?, ...)` | `{ role: { $in: ['admin', 'mod'] } }` |
| `$nin` | `json_extract(doc, '$.field') NOT IN (?, ?, ...)` | `{ role: { $nin: ['banned'] } }` |

## Existence

| Operator | SQL Translation | Example |
|---|---|---|
| `$exists` | `json_extract(doc, '$.field') IS NOT NULL` / `IS NULL` | `{ email: { $exists: true } }` |

## Pattern

| Operator | SQL Translation | Example |
|---|---|---|
| `$regex` | `json_extract(doc, '$.field') REGEXP ?` | `{ name: { $regex: '^A.*' } }` |

Requires SQLite's `REGEXP` operator. AnigoDB registers a default `regexp()` function on open:

```typescript
// Constructor must register:
db.function('regexp', (pattern: string, value: string) => new RegExp(pattern).test(value));
```

Flags are not supported in the MVP — use `(?i)` inline for case-insensitive: `{ name: { $regex: '(?i)^alice' } }`.

## Logical

| Operator | SQL Translation | Example |
|---|---|---|
| `$and` | `WHERE (... ) AND (... )` | `{ $and: [{ age: { $gte: 21 } }, { role: 'admin' }] }` |
| `$or` | `WHERE (... ) OR (... )` | `{ $or: [{ role: 'admin' }, { role: 'mod' }] }` |
| `$not` | `WHERE NOT (... )` | `{ age: { $not: { $gte: 21 } } }` |

Implicit `$and` — multiple keys in a filter object are combined with AND:

```typescript
{ age: { $gte: 21 }, role: 'admin' }
// => WHERE json_extract(doc, '$.age') >= ? AND json_extract(doc, '$.role') = ?
```

## Nested Fields

Use dot notation for nested fields:

```typescript
{ 'address.city': 'New York' }
// => WHERE json_extract(doc, '$.address.city') = ?
```

SQLite's `json_extract` natively supports dotted path navigation.

## Top-Level `_id`

Queries on `_id` use the indexed `_id` column directly, not `json_extract`:

```typescript
{ _id: 'abc123' }
// => WHERE _id = ?
```

This is always fast (primary key lookup).
