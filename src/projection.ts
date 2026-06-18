export function applyProjection<T extends Record<string, unknown>>(
  doc: T,
  projection: Record<string, 1 | 0> | undefined,
): T {
  if (!projection) return doc

  const isInclusion = Object.values(projection).some(v => v === 1)

  if (isInclusion) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(projection)) {
      if (value === 1) {
        result[key] = doc[key]
      }
    }
    return result as T
  }

  const result = { ...doc }
  for (const [key, value] of Object.entries(projection)) {
    if (value === 0) {
      delete result[key]
    }
  }
  return result as T
}
