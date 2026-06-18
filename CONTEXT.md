# AnigoDB Glossary

## AnigoDB
A document database library wrapping better-sqlite3-multiple-ciphers with a MongoDB-style API.

## Embedding Model
A HuggingFace ONNX model used to convert text to vector embeddings for RAG search. Configurable via `AnigoDB.connect({ embedding: { model, dtype, device, pooling, vectorSize } })`.

## hf-embedder
An npm package that provides local text embedding via Transformers.js. Direct runtime dependency of AnigoDB. Default model: `onnx-community/Qwen3-Embedding-0.6B-ONNX`.

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
