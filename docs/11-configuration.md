# Configuration

## Requirements

- **Node.js 20+**

## Connection Options

```typescript
interface AnigoDBOptions {
  /**
   * Path to the SQLite database file.
   * Must be a valid file path. `:memory:` is NOT supported — throws `InvalidPathError`.
   * For testing, use a temporary file path and delete it after the test.
   */
  path: string;

  /** Encryption passphrase. Omit for unencrypted mode (development only). */
  key?: string;

  /** Cipher to use. Default: 'sqlcipher4' */
  cipher?: string;

  /** KDF iterations. Default: 256000 */
  kdfIter?: number;

  /** Enable WAL journal mode. Default: true */
  wal?: boolean;

  /** Busy timeout in milliseconds. Default: 5000 */
  busyTimeout?: number;

  /** SQLite synchronous mode. Default: 'normal' */
  synchronous?: 'off' | 'normal' | 'full';

  /** Page cache size in KB. Default: 64000 */
  cacheSize?: number;

  /** Custom ObjectId generator function */
  objectId?: () => string;

  /** Embedding model configuration for RAG features. Lazy — model loads on first createRAGIndex(). */
  embedding?: {
    /** HuggingFace model ID. Default: 'onnx-community/Qwen3-Embedding-0.6B-ONNX' */
    model?: string;
    /** Quantization. Default: 'q8' */
    dtype?: string;
    /** Execution device. Default: 'cpu' */
    device?: string;
    /** Pooling strategy. Default: 'mean' */
    pooling?: 'mean' | 'last_token';
    /** Vector dimension. Auto-detected from model if omitted. */
    vectorSize?: number;
  };
}
```

## Default Configuration

```typescript
const defaults = {
  cipher: 'sqlcipher4',
  kdfIter: 256000,
  wal: true,
  busyTimeout: 5000,
  synchronous: 'normal',
  cacheSize: 64000,
};
```

## PRAGMA Mapping

| Option | PRAGMA | Default |
|---|---|---|
| `wal` | `journal_mode` | `WAL` (enabled) |
| `busyTimeout` | `busy_timeout` | `5000` |
| `synchronous` | `synchronous` | `NORMAL` |
| `cacheSize` | `cache_size` | `-64000` (64MB) |

## Cipher-Specific PRAGMAs

When `cipher: 'sqlcipher4'`:

| PRAGMA | Value |
|---|---|
| `cipher` | `sqlcipher4` |
| `cipher_page_size` | `4096` |
| `kdf_iter` | `256000` (configurable) |

When `cipher: 'chacha20'`:

| PRAGMA | Value |
|---|---|
| `cipher` | `chacha20` |
| `cipher_page_size` | `4096` |
| `kdf_iter` | `256000` (configurable) |

## Collection-Level Options

`db.collection()` accepts no options in MVP. All behavior is inferred from the connection defaults.

## Custom ObjectId

```typescript
const db = AnigoDB.connect({
  path: './db.db',
  key: 'secret',
  objectId: () => crypto.randomUUID(),
});
```

Provide any function that returns a string. The string must be unique per insert operation (duplicates cause `DuplicateKeyError`).
