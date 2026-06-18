export interface CompiledQuery {
  sql: string
  params: unknown[]
}

function jsonPath(field: string): string {
  if (field === '_id') return field
  return `json_extract(doc, '$.${field}')`
}

function compileValue(value: unknown): { sql: string; params: unknown[] } {
  const path = 'json_extract(doc, ?)'
  return { sql: `${path} = ?`, params: [value] }
}

function compileOperator(field: string, op: string, value: unknown): CompiledQuery {
  const col = jsonPath(field)
  switch (op) {
    case '$eq':
      return { sql: `${col} = ?`, params: [value] }
    case '$ne':
      return { sql: `${col} != ?`, params: [value] }
    case '$gt':
      return { sql: `${col} > ?`, params: [value] }
    case '$gte':
      return { sql: `${col} >= ?`, params: [value] }
    case '$lt':
      return { sql: `${col} < ?`, params: [value] }
    case '$lte':
      return { sql: `${col} <= ?`, params: [value] }
    case '$in': {
      const arr = value as unknown[]
      const placeholders = arr.map(() => '?').join(', ')
      return { sql: `${col} IN (${placeholders})`, params: arr }
    }
    case '$nin': {
      const arr = value as unknown[]
      const placeholders = arr.map(() => '?').join(', ')
      return { sql: `${col} NOT IN (${placeholders})`, params: arr }
    }
    case '$exists':
      return { sql: `${col} IS ${value ? 'NOT NULL' : 'NULL'}`, params: [] }
    case '$regex':
      return { sql: `${col} REGEXP ?`, params: [value] }
    default:
      throw new Error(`Unknown operator: ${op}`)
  }
}

export function compileQuery(filter: Record<string, unknown>): CompiledQuery {
  const clauses: string[] = []
  const params: unknown[] = []
  const operators = ['$and', '$or', '$not', '$nor']

  for (const key of Object.keys(filter)) {
    const value = filter[key]

    if (key === '$and') {
      const parts = (value as Record<string, unknown>[]).map(compileQuery)
      clauses.push(`(${parts.map(p => p.sql).join(') AND (')})`)
      for (const p of parts) params.push(...p.params)
      continue
    }

    if (key === '$or') {
      const parts = (value as Record<string, unknown>[]).map(compileQuery)
      clauses.push(`(${parts.map(p => p.sql).join(') OR (')})`)
      for (const p of parts) params.push(...p.params)
      continue
    }

    if (key === '$not') {
      const inner = compileQuery(value as Record<string, unknown>)
      clauses.push(`NOT (${inner.sql})`)
      params.push(...inner.params)
      continue
    }

    if (key === '$nor') {
      const parts = (value as Record<string, unknown>[]).map(compileQuery)
      clauses.push(`NOT (${parts.map(p => p.sql).join(') OR (')})`)
      for (const p of parts) params.push(...p.params)
      continue
    }

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const ops = value as Record<string, unknown>

      if ('$not' in ops) {
        const inner = compileQuery({ [key]: ops['$not'] } as Record<string, unknown>)
        clauses.push(`NOT (${inner.sql})`)
        params.push(...inner.params)
        continue
      }

      for (const op of Object.keys(ops)) {
        if (op.startsWith('$')) {
          const compiled = compileOperator(key, op, ops[op])
          clauses.push(compiled.sql)
          params.push(...compiled.params)
        }
      }
    } else {
      const col = jsonPath(key)
      clauses.push(`${col} = ?`)
      params.push(value)
    }
  }

  if (clauses.length === 0) {
    return { sql: '', params: [] }
  }

  return { sql: clauses.join(' AND '), params }
}
