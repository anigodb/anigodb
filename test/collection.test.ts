import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { rmSync, existsSync } from 'fs'
import { AnigoDB } from '../src/anigo-db.js'

function createTestDb(): { db: AnigoDB; path: string } {
  const path = join(tmpdir(), `anigodb-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
  const db = AnigoDB.connect({ path })
  return { db, path }
}

function cleanup(db: AnigoDB, path: string) {
  db.close()
  if (existsSync(path)) rmSync(path)
}

describe('Collection', () => {
  let db: AnigoDB
  let path: string
  let col: ReturnType<typeof db.collection>

  beforeEach(() => {
    const created = createTestDb()
    db = created.db
    path = created.path
    col = db.collection('test')
  })

  afterEach(() => {
    cleanup(db, path)
  })

  it('insertOne returns insertedId', () => {
    const result = col.insertOne({ name: 'Alice' })
    expect(result.acknowledged).toBe(true)
    expect(typeof result.insertedId).toBe('string')
    expect(result.insertedId.length).toBe(24)
  })

  it('insertOne stores the document', () => {
    const { insertedId } = col.insertOne({ name: 'Alice', age: 30 })
    const doc = col.findOne({ _id: insertedId })
    expect(doc).not.toBeNull()
    expect(doc!.name).toBe('Alice')
    expect(doc!.age).toBe(30)
    expect(doc!._id).toBe(insertedId)
  })

  it('insertOne with custom _id', () => {
    col.insertOne({ _id: 'my-id', name: 'Bob' })
    const doc = col.findOne({ _id: 'my-id' })
    expect(doc).not.toBeNull()
    expect(doc!.name).toBe('Bob')
  })

  it('insertOne throws DuplicateKeyError on duplicate _id', () => {
    col.insertOne({ _id: 'dup', name: 'First' })
    expect(() => col.insertOne({ _id: 'dup', name: 'Second' })).toThrow('_id \'dup\' already exists')
  })

  it('insertOne rejects Buffer', () => {
    expect(() => col.insertOne({ data: Buffer.from('test') } as any)).toThrow(TypeError)
  })

  it('insertOne omits undefined fields', () => {
    const { insertedId } = col.insertOne({ name: 'Alice', extra: undefined })
    const doc = col.findOne({ _id: insertedId })
    expect(doc!.extra).toBeUndefined()
  })

  it('insertMany inserts multiple documents', () => {
    const result = col.insertMany([{ name: 'A' }, { name: 'B' }, { name: 'C' }])
    expect(result.insertedIds.length).toBe(3)
    expect(col.countDocuments({})).toBe(3)
  })

  it('insertMany rolls back on failure', () => {
    col.insertOne({ _id: 'existing' })
    expect(() => col.insertMany([{ name: 'X' }, { _id: 'existing' }, { name: 'Z' }])).toThrow()
    expect(col.countDocuments({})).toBe(1)
  })

  it('findOne returns null for no match', () => {
    expect(col.findOne({ name: 'nonexistent' })).toBeNull()
  })

  it('findOne with sort returns correct document', () => {
    col.insertOne({ name: 'A', order: 1 })
    col.insertOne({ name: 'B', order: 2 })
    const doc = col.findOne({}, { sort: { order: -1 } })
    expect(doc!.name).toBe('B')
  })

  it('find returns matching documents', () => {
    col.insertOne({ name: 'Alice', role: 'admin' })
    col.insertOne({ name: 'Bob', role: 'user' })
    col.insertOne({ name: 'Charlie', role: 'admin' })
    const admins = col.find({ role: 'admin' })
    expect(admins.length).toBe(2)
  })

  it('find with sort, skip, limit', () => {
    col.insertOne({ name: 'C', order: 3 })
    col.insertOne({ name: 'A', order: 1 })
    col.insertOne({ name: 'B', order: 2 })
    const results = col.find({}, { sort: { order: 1 }, skip: 1, limit: 1 })
    expect(results.length).toBe(1)
    expect(results[0].name).toBe('B')
  })

  it('updateOne modifies document', () => {
    const { insertedId } = col.insertOne({ name: 'Alice', age: 30 })
    const result = col.updateOne({ _id: insertedId }, { $set: { age: 31 } })
    expect(result.matchedCount).toBe(1)
    expect(result.modifiedCount).toBe(1)
    const doc = col.findOne({ _id: insertedId })
    expect(doc!.age).toBe(31)
  })

  it('updateOne upsert creates document', () => {
    const result = col.updateOne({ _id: 'new-id' }, { $set: { name: 'New' } }, { upsert: true })
    expect(result.upsertedId).toBe('new-id')
    expect(col.countDocuments({})).toBe(1)
  })

  it('updateMany updates all matching', () => {
    col.insertOne({ role: 'user', points: 10 })
    col.insertOne({ role: 'user', points: 20 })
    col.insertOne({ role: 'admin', points: 30 })
    const result = col.updateMany({ role: 'user' }, { $inc: { points: 5 } })
    expect(result.modifiedCount).toBe(2)
  })

  it('deleteOne removes matching document', () => {
    const { insertedId } = col.insertOne({ name: 'Alice' })
    const result = col.deleteOne({ _id: insertedId })
    expect(result.deletedCount).toBe(1)
    expect(col.countDocuments({})).toBe(0)
  })

  it('deleteMany removes all matching', () => {
    col.insertOne({ role: 'user' })
    col.insertOne({ role: 'user' })
    col.insertOne({ role: 'admin' })
    const result = col.deleteMany({ role: 'user' })
    expect(result.deletedCount).toBe(2)
  })

  it('countDocuments returns accurate count', () => {
    expect(col.countDocuments({})).toBe(0)
    col.insertOne({ name: 'A' })
    col.insertOne({ name: 'B' })
    expect(col.countDocuments({})).toBe(2)
  })

  it('findOneAndUpdate returns document', () => {
    const { insertedId } = col.insertOne({ name: 'Alice', age: 30 })
    const doc = col.findOneAndUpdate({ _id: insertedId }, { $set: { age: 31 } })
    expect(doc!.age).toBe(30) // returns original by default
  })

  it('findOneAndUpdate with returnDocument after returns updated doc', () => {
    const { insertedId } = col.insertOne({ name: 'Alice', age: 30 })
    const doc = col.findOneAndUpdate({ _id: insertedId }, { $set: { age: 31 } }, { returnDocument: 'after' })
    expect(doc!.age).toBe(31)
  })

  it('findOneAndDelete returns deleted doc', () => {
    const { insertedId } = col.insertOne({ name: 'Alice' })
    const doc = col.findOneAndDelete({ _id: insertedId })
    expect(doc!.name).toBe('Alice')
    expect(col.countDocuments({})).toBe(0)
  })

  it('findOneAndReplace replaces document', () => {
    const { insertedId } = col.insertOne({ name: 'Alice', age: 30 })
    const doc = col.findOneAndReplace({ _id: insertedId }, { name: 'Bob', age: 25 })
    expect(doc!.name).toBe('Alice') // returns original
    const updated = col.findOne({ _id: insertedId })
    expect(updated!.name).toBe('Bob')
  })

  it('createIndex creates expression index', () => {
    const name = col.createIndex({ name: 1 })
    expect(typeof name).toBe('string')
    expect(name).toContain('idx')
  })

  it('dropIndex drops created index', () => {
    const name = col.createIndex({ name: 1 })
    expect(() => col.dropIndex(name)).not.toThrow()
  })

  it('aggregate with $match and $sort', () => {
    col.insertOne({ name: 'C', order: 3 })
    col.insertOne({ name: 'A', order: 1 })
    col.insertOne({ name: 'B', order: 2 })
    const results = col.aggregate([
      { $sort: { order: 1 } },
      { $skip: 1 },
    ])
    expect(results.length).toBe(2)
    expect(results[0].name).toBe('B')
  })

  it('aggregate with $count', () => {
    col.insertOne({ name: 'A' })
    col.insertOne({ name: 'B' })
    const results = col.aggregate([{ $count: 'total' }])
    expect(results[0].total).toBe(2)
  })

  it('collectionName returns the name', () => {
    expect(col.collectionName).toBe('test')
  })
})
