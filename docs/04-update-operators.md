# Update Operators

AnigoDB translates MongoDB-style update documents into SQL `json_set` / `json_remove` expressions. Multiple operators in a single update are combined into nested SQL calls.

## Supported Operators

### `$set`

Sets one or more fields:

```typescript
{ $set: { age: 31, 'address.city': 'Boston' } }
// => json_set(doc, '$.age', json_extract(doc, '$.age'), 31,
//                  '$.address.city', json_extract(doc, '$.address.city'), 'Boston')
```

Creates nested paths if they don't exist. Overwrites existing values.

### `$unset`

Removes one or more fields:

```typescript
{ $unset: { temporaryField: '' } }
// => json_remove(doc, '$.temporaryField')
```

The value in the operator is ignored (any truthy key triggers removal), matching MongoDB behavior.

### `$inc`

Increments a numeric field:

```typescript
{ $inc: { counter: 1, score: -5 } }
// => json_set(doc,
//   '$.counter', json_extract(doc, '$.counter') + 1,
//   '$.score', json_extract(doc, '$.score') - 5
// )
```

If the field doesn't exist, the increment starts from `0`.

### `$push`

Appends a value to an array field:

```typescript
{ $push: { skills: 'TypeScript' } }
// JS-level: read doc, parse JSON, push, re-stringify, UPDATE
```

`$push` requires a read-modify-write cycle in JavaScript because SQLite's JSON functions cannot partially mutate arrays. This happens inside a transaction for atomicity.

### `$pull`

Removes matching values from an array:

```typescript
{ $pull: { tags: 'old-tag' } }
// JS-level: read doc, parse JSON, filter array, re-stringify, UPDATE
```

Like `$push`, requires a JS read-modify-write.

### `$rename`

Renames a field:

```typescript
{ $rename: { oldName: 'newName' } }
// => json_set(json_remove(doc, '$.oldName'), '$.newName', json_extract(doc, '$.oldName'))
```

---

## Combining Operators

All operators in a single update call are applied atomically within one SQL expression (except `$push` / `$pull` which run separately before the SQL update):

```typescript
users.updateOne(
  { name: 'Alice' },
  { $set: { age: 32 }, $inc: { loginCount: 1 } }
);
```

Operator precedence of evaluation:
1. `$push` / `$pull` (JS mutation)
2. `$unset` (SQL json_remove)
3. `$rename` (SQL json_remove + json_set)
4. `$set` / `$inc` (SQL json_set)

This ordering prevents `$unset` from removing a field that `$set` just added, and ensures `$rename` can target a path that `$unset` has cleared.
