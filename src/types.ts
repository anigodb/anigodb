export interface EmbeddingOptions {
  model?: string
  dtype?: string
  device?: string
  pooling?: 'mean' | 'last_token'
  vectorSize?: number
}

export interface AnigoDBOptions {
  path: string
  key?: string
  cipher?: string
  kdfIter?: number
  wal?: boolean
  busyTimeout?: number
  synchronous?: 'off' | 'normal' | 'full'
  cacheSize?: number
  objectId?: () => string
  embedding?: EmbeddingOptions
}

export type OptionalId<T> = T & { _id?: string }

export interface InsertOneResult {
  acknowledged: true
  insertedId: string
}

export interface InsertManyResult {
  acknowledged: true
  insertedIds: string[]
}

export interface UpdateResult {
  acknowledged: true
  matchedCount: number
  modifiedCount: number
  upsertedId: string | null
}

export interface DeleteResult {
  acknowledged: true
  deletedCount: number
}

export type SortDirection = 1 | -1

export interface Sort {
  [field: string]: SortDirection
}

export type Filter<T> = {
  [P in keyof T]?: T[P] | OperatorValue<T[P]>
} & {
  [key: `${string}.${string}`]: unknown
  $and?: Filter<T>[]
  $or?: Filter<T>[]
  $nor?: Filter<T>[]
  $not?: Filter<T>
}

export type OperatorValue<T> = {
  $eq?: T
  $ne?: T
  $gt?: T
  $gte?: T
  $lt?: T
  $lte?: T
  $in?: T[]
  $nin?: T[]
  $regex?: string | RegExp
  $exists?: boolean
  $type?: string
}

export type Update<T> = {
  $set?: Partial<T>
  $unset?: Record<string, string>
  $inc?: Record<string, number>
  $push?: Record<string, unknown>
  $pull?: Record<string, unknown>
  $rename?: Record<string, string>
  $mul?: Record<string, number>
  $min?: Record<string, number>
  $max?: Record<string, number>
}

export interface FindOneOptions {
  sort?: Sort
}

export interface FindOptions {
  sort?: Sort
  skip?: number
  limit?: number
}

export interface UpdateOptions {
  upsert?: boolean
}

export interface FindOneAndUpdateOptions {
  sort?: Sort
  returnDocument?: 'before' | 'after'
}

export interface FindOneAndDeleteOptions {
  sort?: Sort
}

export interface FindOneAndReplaceOptions {
  sort?: Sort
  returnDocument?: 'before' | 'after'
}

export interface SearchOptions {
  limit?: number
}

export interface RAGProvider {
  createRAGIndex(table: string, field: string): void
  search<T>(table: string, query: string, limit: number): T[]
}

export interface SearchResult<T> {
  _score: number
  _collection?: string
  [key: string]: unknown
}

export type Stage =
  | { $match: Record<string, unknown> }
  | { $sort: Record<string, SortDirection> }
  | { $skip: number }
  | { $limit: number }
  | { $count: string }

export interface IndexSpec {
  [field: string]: 1 | -1
}
