import { describe, it, expect } from 'vitest'
import { generateObjectId } from '../src/object-id.js'

describe('generateObjectId', () => {
  it('returns a 24-character hex string', () => {
    const id = generateObjectId()
    expect(id).toMatch(/^[0-9a-f]{24}$/)
  })

  it('returns unique values on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateObjectId()))
    expect(ids.size).toBe(100)
  })

  it('contains an 8-char hex timestamp prefix', () => {
    const id = generateObjectId()
    const ts = parseInt(id.slice(0, 8), 16)
    const now = Math.floor(Date.now() / 1000)
    expect(Math.abs(ts - now)).toBeLessThan(5)
  })
})
