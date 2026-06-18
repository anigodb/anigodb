import { describe, it, expect } from 'vitest'
import { compileQuery } from '../src/query.js'

describe('compileQuery', () => {
  it('shorthand value becomes $eq', () => {
    const { sql, params } = compileQuery({ name: 'Alice' })
    expect(sql).toBe("json_extract(doc, '$.name') = ?")
    expect(params).toEqual(['Alice'])
  })

  it('$eq operator', () => {
    const { sql, params } = compileQuery({ age: { $eq: 30 } })
    expect(sql).toBe("json_extract(doc, '$.age') = ?")
    expect(params).toEqual([30])
  })

  it('$ne operator', () => {
    const { sql, params } = compileQuery({ age: { $ne: 30 } })
    expect(sql).toBe("json_extract(doc, '$.age') != ?")
    expect(params).toEqual([30])
  })

  it('$gt operator', () => {
    const { sql } = compileQuery({ age: { $gt: 21 } })
    expect(sql).toContain('>')
  })

  it('$gte operator', () => {
    const { sql } = compileQuery({ age: { $gte: 21 } })
    expect(sql).toContain('>=')
  })

  it('$lt operator', () => {
    const { sql } = compileQuery({ age: { $lt: 65 } })
    expect(sql).toContain('<')
  })

  it('$lte operator', () => {
    const { sql } = compileQuery({ age: { $lte: 65 } })
    expect(sql).toContain('<=')
  })

  it('$in operator', () => {
    const { sql, params } = compileQuery({ role: { $in: ['admin', 'mod'] } })
    expect(sql).toContain('IN (?, ?)')
    expect(params).toEqual(['admin', 'mod'])
  })

  it('$nin operator', () => {
    const { sql } = compileQuery({ role: { $nin: ['banned'] } })
    expect(sql).toContain('NOT IN')
  })

  it('$exists true', () => {
    const { sql } = compileQuery({ email: { $exists: true } })
    expect(sql).toContain('IS NOT NULL')
  })

  it('$exists false', () => {
    const { sql } = compileQuery({ email: { $exists: false } })
    expect(sql).toContain('IS NULL')
  })

  it('$regex operator', () => {
    const { sql, params } = compileQuery({ name: { $regex: '^A.*' } })
    expect(sql).toContain('REGEXP ?')
    expect(params).toEqual(['^A.*'])
  })

  it('dot notation for nested fields', () => {
    const { sql } = compileQuery({ 'address.city': 'New York' })
    expect(sql).toBe("json_extract(doc, '$.address.city') = ?")
  })

  it('_id field uses raw column', () => {
    const { sql } = compileQuery({ _id: 'abc123' })
    expect(sql).toBe('_id = ?')
  })

  it('$and combines conditions', () => {
    const { sql, params } = compileQuery({
      $and: [{ age: { $gte: 21 } }, { role: 'admin' }],
    })
    expect(sql).toContain('AND')
    expect(params).toEqual([21, 'admin'])
  })

  it('$or combines conditions', () => {
    const { sql } = compileQuery({
      $or: [{ role: 'admin' }, { role: 'mod' }],
    })
    expect(sql).toContain('OR')
  })

  it('$not negates condition', () => {
    const { sql, params } = compileQuery({
      age: { $not: { $gte: 21 } },
    })
    expect(sql).toContain('NOT')
    expect(params).toEqual([21])
  })

  it('$nor negates OR condition', () => {
    const { sql } = compileQuery({
      $nor: [{ role: 'admin' }, { role: 'mod' }],
    })
    expect(sql).toContain('NOT')
    expect(sql).toContain('OR')
  })

  it('multiple fields are ANDed', () => {
    const { sql, params } = compileQuery({ age: { $gte: 21 }, role: 'admin' })
    expect(sql).toContain('AND')
    expect(params).toEqual([21, 'admin'])
  })

  it('empty filter returns empty sql', () => {
    const { sql, params } = compileQuery({})
    expect(sql).toBe('')
    expect(params).toEqual([])
  })
})
