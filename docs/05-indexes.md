# Indexes

## Expression Indexes

AnigoDB uses SQLite **expression indexes** on `json_extract()` calls. These are invisible to your application logic — you work with documents, not columns.

```typescript
users.createIndex({ 'profile.role': 1 });
// SQL: CREATE INDEX IF NOT EXISTS idx_users_profile_role
//      ON users(json_extract(doc, '$.profile.role'))
```

When you query with the same JSON path, SQLite's query planner automatically uses the index:

```typescript
users.find({ 'profile.role': 'admin' });
// SQL: SELECT * FROM users
//      WHERE json_extract(doc, '$.profile.role') = ?
//      ↑ Planner matches the expression index
```

## Compound Indexes

Multiple paths in a single index:

```typescript
users.createIndex({ age: 1, name: 1 });
// SQL: CREATE INDEX IF NOT EXISTS idx_users_age_name
//      ON users(
//        json_extract(doc, '$.age'),
//        json_extract(doc, '$.name')
//      )
```

Works with queries that filter on both fields, or on the prefix field only (standard SQLite compound index rules).

## Covered Queries

Since the index only covers the `json_extract` expressions (not the entire document), queries still need to read `doc` from the table. SQLite will use the index for rowid lookup, then fetch `doc` — a `table scan → index scan` improvement.

## Index Names

Generated automatically:
- Single field: `idx_{collection}_{path_segments}`
- Compound: `idx_{collection}_{path1}_{path2}_...`

Path segments are joined with underscores. Dots become underscores.

You can drop an index:

```typescript
users.dropIndex('idx_users_profile_role');
```

## RAG Indexes

RAG indexes are **different** from expression indexes — they enable semantic + keyword search on document fields. See [13-rag-search.md](13-rag-search.md) for full documentation.

```typescript
articles.createRAGIndex('title');
// Creates:
//   - vec_articles_title  (sqlite-vec vector table, dimension 1024)
//   - fts_articles_title  (SQLite FTS5 table)
//   - AFTER INSERT/UPDATE/DELETE triggers for auto-indexing
```

RAG indexes use `sqlite-hybrid` under the hood, which wraps `sqlite-vec` for vector operations and SQLite's built-in FTS5 for keyword search. Search fuses both via Reciprocal Rank Fusion (RRF).

### RAG vs Expression Indexes

| Feature | Expression Index | RAG Index |
|---|---|---|
| Purpose | Fast structured queries | Semantic + keyword search |
| Underlying | `CREATE INDEX ON table(json_extract(...))` | `vec0` virtual table + FTS5 |
| Query method | `find({ field: value })` | `search("query")` |
| Supported types | Any JSON value | Text (embedded via ONNX model) |
| External deps | None | `sqlite-hybrid` (runtime), `hf-embedder` (runtime) |

## Limitations

- Indexes on array elements (`$.**` path expressions) are not supported
- Functions in index expressions are limited to `json_extract` only
- Indexes are **not** automatically updated when the schema of documents changes — they index whatever value `json_extract` finds at the path
- Sorting by an indexed field uses the index (ascending or descending)
