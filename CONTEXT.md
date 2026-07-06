# AnigoDB Glossary

## AnigoDB
A document database library wrapping better-sqlite3-multiple-ciphers with a MongoDB-style API.

## Embedding Model
A HuggingFace ONNX model used to convert text to vector embeddings for RAG search. Configurable via `AnigoDB.connect({ embedding: { model, dtype, device, pooling, vectorSize } })`.

## hf-embedder
An npm package that provides local text embedding via Transformers.js. Direct runtime dependency of AnigoDB. Default model: `onnx-community/Qwen3-Embedding-0.6B-ONNX`. Only loaded when embedding is configured (either via `connect()` option or saved `_anigodb_meta`).

## sqlite-hybrid
An npm package that manages vec0 + FTS5 virtual tables and performs RRF-fused hybrid search. Accepts `onEmbed` callback for embedding.

## RAG Index
A pair of SQLite virtual tables (vec0 for vector search, FTS5 for keyword search) on a collection field.

## Hybrid Search
Retrieval combining vector similarity (cosine distance) and keyword ranking (BM25), fused via Reciprocal Rank Fusion (RRF).

## Sync Embedder
An hf-embedder instance created via `Embedder.createSync()` that runs inference on a background thread and blocks the calling thread — compatible with AnigoDB's synchronous API.

## vectorSize
The dimensionality of the embedding model's output. Auto-detected from the model if not specified by the user.

## \_anigodb\_meta
An internal single-row SQLite table (`id INTEGER PRIMARY KEY CHECK (id = 1)`) that stores a JSON `config` blob with persisted embedding metadata. Written at `createRAGIndex()` time. On subsequent opens, the saved config is the source of truth for existing RAG indexes; user-provided `embedding` in `connect()` is ignored when saved config exists.

## Disabled RAG Mode
When no `embedding` option is passed to `connect()` and no `_anigodb_meta` exists, `getRagManager()` returns `null`. Calling RAG methods (`search`, `createRAGIndex`) throws `RAGNotConfiguredError`.
