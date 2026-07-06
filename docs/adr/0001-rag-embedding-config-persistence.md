# ADR 1: RAG Embedding Config Persistence

## Status
Accepted

## Context
When a user opens an existing database that has RAG indexes, the embedding
model used to create those indexes must be known. If the user provides a
different model at `connect()` time, the vectors in the vec0 table become
incompatible. Without persisted config, AnigoDB falls through to
hf-embedder's default model silently, which is surprising and fragile.

The project is pre-v1.0, so no migration path from existing databases is
needed.

## Decision
1. A single-row SQLite table `_anigodb_meta` stores embedding config as a
   JSON blob. The row is written at `createRAGIndex()` time — the first
   point where RAG is actually used.
2. On subsequent opens, the saved config is the authoritative source of
   truth. Any user-provided `embedding` in `connect()` is ignored when
   saved config exists.
3. If no embedding option is passed to `connect()` and no saved config
   exists, `getRagManager()` returns `null`. Calling RAG methods throws
   `RAGNotConfiguredError`.
4. If `_anigodb_meta` is absent but `_sqlite_hybrid_indexes` has rows
   (manual tampering), the error is raised at first RAG use, not at
   connect time.

## Consequences
- Users who open an existing DB to do normal document operations are not
  forced to configure embedding.
- Users who create RAG indexes get their config locked in, preventing
  accidental model mismatches.
- Saved config + null-RagManager replaces the current fallthrough-to-default
  behavior.
- hf-embedder is only loaded (as a lazy require) when embedding is
  actively configured or saved — not eagerly on every connect.
