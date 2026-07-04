import { describe, it, expect } from 'vitest'
import { AnigoError, DuplicateKeyError, InvalidPathError, RAGModelError } from '../src/errors.js'

describe('error classes', () => {
  it('AnigoError is instanceof Error and AnigoError', () => {
    const err = new AnigoError('test')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AnigoError)
    expect(err.message).toBe('test')
    expect(err.name).toBe('AnigoError')
  })

  it('AnigoError supports ErrorOptions cause', () => {
    const cause = new Error('root cause')
    const err = new AnigoError('wrapped', { cause })
    expect(err.cause).toBe(cause)
  })

  it('DuplicateKeyError is instanceof AnigoError', () => {
    const err = new DuplicateKeyError('duplicate _id')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AnigoError)
    expect(err).toBeInstanceOf(DuplicateKeyError)
    expect(err.message).toBe('duplicate _id')
    expect(err.name).toBe('DuplicateKeyError')
  })

  it('InvalidPathError is instanceof AnigoError', () => {
    const err = new InvalidPathError('invalid path')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AnigoError)
    expect(err).toBeInstanceOf(InvalidPathError)
    expect(err.message).toBe('invalid path')
    expect(err.name).toBe('InvalidPathError')
  })

  it('RAGModelError is instanceof AnigoError', () => {
    const cause = new Error('network failure')
    const err = new RAGModelError('model init failed', { cause })
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AnigoError)
    expect(err).toBeInstanceOf(RAGModelError)
    expect(err.message).toBe('model init failed')
    expect(err.name).toBe('RAGModelError')
    expect(err.cause).toBe(cause)
  })
})
