export class AnigoError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AnigoError'
  }
}

export class DuplicateKeyError extends AnigoError {
  constructor(message: string) {
    super(message)
    this.name = 'DuplicateKeyError'
  }
}

export class InvalidPathError extends AnigoError {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidPathError'
  }
}

export class RAGModelError extends AnigoError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RAGModelError'
  }
}

export class RAGNotConfiguredError extends AnigoError {
  constructor(message?: string) {
    super(message ?? 'RAG is not configured. Pass `embedding` option to `AnigoDB.connect()`.')
    this.name = 'RAGNotConfiguredError'
  }
}
