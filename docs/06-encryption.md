# Encryption

AnigoDB uses **SQLCipher v4** via `better-sqlite3-multiple-ciphers` for transparent, database-level encryption.

## How It Works

When you open a database with a `key`, the PRAGMA key is set before any other operation. SQLCipher encrypts every page written to disk using **AES-256-XTS** with per-page **HMAC-SHA512** authentication. Without the correct key, the database file is indistinguishable from random noise.

## Default Configuration

| Setting | Value | Notes |
|---|---|---|
| Cipher | `sqlcipher4` | AES-256-XTS + per-page HMAC |
| Page size | `4096` | SQLCipher v4 default |
| KDF iterations | `256000` | PBKDF2-HMAC-SHA512 |
| HMAC algorithm | `HMAC-SHA512` | Per-page authentication |

## Usage

```typescript
// Open with encryption key
const db = AnigoDB.connect({
  path: './encrypted.db',
  key: 'your-secret-passphrase',
});

// All subsequent reads/writes are transparently encrypted
```

**The `key` is required for encrypted mode.** Omit `key` to create an unencrypted database (suitable for development). See [Getting Started — Unencrypted Mode](01-getting-started.md#unencrypted-mode).

## Key Management

- **Minimum key length**: AnigoDB does not enforce a minimum — but you should use a strong passphrase (recommended: 16+ characters, mixed case, digits, symbols)
- **Key rotation**: Not supported directly. Export your data to a new database with the new key
- **Key loss**: The database is unrecoverable. There is no backdoor

## Custom Cipher Configuration

Override defaults via connection options:

```typescript
const db = AnigoDB.connect({
  path: './db.db',
  key: 'secret',
  cipher: 'chacha20',       // alternative cipher
  kdfIter: 64000,           // custom KDF iterations
});
```

## Security Considerations

- SQLCipher v4 uses AES-256-XTS, which is resistant to watermarking attacks
- Per-page HMAC detects tampering (unauthorized modification of encrypted pages)
- WAL mode pages are also encrypted
- The passphrase lives in memory for the lifetime of the `AnigoDB` instance
- Backup your database file while encrypted — the backup inherits the same encryption

### Unencrypted Mode

When `key` is omitted, no SQLCipher PRAGMAs are set. The database file is plain SQLite, readable by any SQLite tool (e.g., `sqlite3 mydb.db`). All other features (indexes, RAG, transactions) work identically.
