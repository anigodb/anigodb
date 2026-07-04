export interface CompiledUpdate {
  setExprs: string[]
  setFields: string[]
  removePaths: string[]
  params: unknown[]
  pushPull: Array<{ field: string; value: unknown; operator: 'push' | 'pull' }>
}

function jsonPath(path: string): string {
  return `$.${path}`
}

export function compileUpdate(update: Record<string, unknown>): CompiledUpdate {
  const setExprs: string[] = []
  const setFields: string[] = []
  const removePaths: string[] = []
  const params: unknown[] = []
  const pushPull: Array<{ field: string; value: unknown; operator: 'push' | 'pull' }> = []

  for (const op of Object.keys(update)) {
    const fields = update[op] as Record<string, unknown>

    switch (op) {
      case '$set': {
        for (const [field, value] of Object.entries(fields)) {
          const p = jsonPath(field)
          setExprs.push(`'${p}', ?`)
          setFields.push(field)
          params.push(value)
        }
        break
      }

      case '$unset': {
        for (const field of Object.keys(fields)) {
          removePaths.push(jsonPath(field))
        }
        break
      }

      case '$inc': {
        for (const [field, value] of Object.entries(fields)) {
          const p = jsonPath(field)
          setExprs.push(`'${p}', COALESCE(json_extract(doc, '${p}'), 0) + ?`)
          setFields.push(field)
          params.push(value)
        }
        break
      }

      case '$rename': {
        for (const [from, to] of Object.entries(fields)) {
          const fromPath = jsonPath(from)
          const toPath = jsonPath(to as string)
          removePaths.push(fromPath)
          setExprs.push(`'${toPath}', json_extract(doc, '${fromPath}')`)
          setFields.push(to as string)
        }
        break
      }

      case '$push': {
        for (const [field, value] of Object.entries(fields)) {
          const p = jsonPath(field)
          setExprs.push(`'${p}', COALESCE((SELECT json_group_array(value) FROM (SELECT value FROM json_each(json_extract(doc, '${p}')) UNION ALL SELECT ?)), json_array(?))`)
          setFields.push(field)
          params.push(value, value)
          pushPull.push({ field, value, operator: 'push' })
        }
        break
      }

      case '$pull': {
        for (const [field, value] of Object.entries(fields)) {
          const p = jsonPath(field)
          setExprs.push(`'${p}', COALESCE((SELECT json_group_array(value) FROM json_each(json_extract(doc, '${p}')) WHERE value != ?), json_array())`)
          setFields.push(field)
          params.push(value)
          pushPull.push({ field, value, operator: 'pull' })
        }
        break
      }

      case '$mul': {
        for (const [field, value] of Object.entries(fields)) {
          const p = jsonPath(field)
          setExprs.push(`'${p}', COALESCE(json_extract(doc, '${p}'), 1) * ?`)
          setFields.push(field)
          params.push(value)
        }
        break
      }

      case '$min': {
        for (const [field, value] of Object.entries(fields)) {
          const p = jsonPath(field)
          setExprs.push(`'${p}', MIN(COALESCE(json_extract(doc, '${p}'), ?), ?)`)
          setFields.push(field)
          params.push(value, value)
        }
        break
      }

      case '$max': {
        for (const [field, value] of Object.entries(fields)) {
          const p = jsonPath(field)
          setExprs.push(`'${p}', MAX(COALESCE(json_extract(doc, '${p}'), ?), ?)`)
          setFields.push(field)
          params.push(value, value)
        }
        break
      }
    }
  }

  return { setExprs, setFields, removePaths, params, pushPull }
}

export function buildUpdateSQL(compiled: CompiledUpdate): string {
  let expr = 'doc'

  for (const path of compiled.removePaths) {
    expr = `json_remove(${expr}, '${path}')`
  }

  for (const setExpr of compiled.setExprs) {
    expr = `json_set(${expr}, ${setExpr})`
  }

  if (expr === 'doc') return ''
  return expr
}
