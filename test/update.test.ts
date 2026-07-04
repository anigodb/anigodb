import { describe, it, expect } from 'vitest'
import { compileUpdate, buildUpdateSQL } from '../src/update.js'

describe('compileUpdate', () => {
  it('$set produces set expressions and params', () => {
    const result = compileUpdate({ $set: { age: 31, name: 'Bob' } })
    expect(result.setExprs.length).toBe(2)
    expect(result.params).toContain(31)
    expect(result.params).toContain('Bob')
    expect(result.pushPull).toEqual([])
  })

  it('$unset produces remove paths', () => {
    const result = compileUpdate({ $unset: { temp: '' } })
    expect(result.removePaths).toEqual(['$.temp'])
  })

  it('$inc produces set expression with addition', () => {
    const result = compileUpdate({ $inc: { counter: 1, score: -5 } })
    expect(result.setExprs.length).toBe(2)
    expect(result.params).toEqual([1, -5])
  })

  it('$rename produces remove + set', () => {
    const result = compileUpdate({ $rename: { oldName: 'newName' } })
    expect(result.removePaths).toEqual(['$.oldName'])
    expect(result.setExprs.length).toBe(1)
  })

  it('$push adds to pushPull list', () => {
    const result = compileUpdate({ $push: { skills: 'TypeScript' } })
    expect(result.pushPull).toEqual([{ field: 'skills', value: 'TypeScript', operator: 'push' }])
  })

  it('$pull adds to pushPull list', () => {
    const result = compileUpdate({ $pull: { tags: 'old-tag' } })
    expect(result.pushPull).toEqual([{ field: 'tags', value: 'old-tag', operator: 'pull' }])
  })

  it('$mul produces multiplication', () => {
    const result = compileUpdate({ $mul: { price: 1.1 } })
    expect(result.setExprs.length).toBe(1)
    expect(result.params).toEqual([1.1])
  })

  it('$min produces MIN expression', () => {
    const result = compileUpdate({ $min: { level: 5 } })
    expect(result.setExprs.length).toBe(1)
  })

  it('$max produces MAX expression', () => {
    const result = compileUpdate({ $max: { highScore: 100 } })
    expect(result.setExprs.length).toBe(1)
  })

  it('combines multiple operators', () => {
    const result = compileUpdate({ $set: { name: 'Bob' }, $inc: { count: 1 } })
    expect(result.setExprs.length).toBe(2)
    expect(result.params.length).toBe(2)
  })
})

describe('buildUpdateSQL', () => {
  it('returns empty string for no changes', () => {
    const sql = buildUpdateSQL({ setExprs: [], setFields: [], removePaths: [], params: [], pushPull: [] })
    expect(sql).toBe('')
  })

  it('builds json_set from set expressions', () => {
    const compiled = compileUpdate({ $set: { age: 31 } })
    const sql = buildUpdateSQL(compiled)
    expect(sql).toContain('json_set')
    expect(sql).toContain('$.age')
  })

  it('builds json_remove for unset', () => {
    const compiled = compileUpdate({ $unset: { temp: '' } })
    const sql = buildUpdateSQL(compiled)
    expect(sql).toContain('json_remove')
  })

  it('applies unset inside set (json_remove wrapped by json_set)', () => {
    const compiled = compileUpdate({
      $unset: { oldField: '' },
      $set: { newField: 'value' },
    })
    const sql = buildUpdateSQL(compiled)
    expect(sql).toContain('json_remove')
    expect(sql).toContain('json_set')
    // json_set wraps json_remove: json_set(json_remove(doc, ...), ...)
    expect(sql.indexOf('json_set')).toBeLessThan(sql.indexOf('json_remove'))
  })
})
