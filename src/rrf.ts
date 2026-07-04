const K = 60

export function fuseResults<T extends Record<string, unknown>>(
  vecResults: T[],
  keyResults: T[],
  limit: number,
): T[] {
  const vecMap = new Map<string, { rank: number; similarity: number; record: T }>()
  vecResults.forEach((r, i) => {
    const id = r._id as string
    if (id != null && !vecMap.has(id)) {
      vecMap.set(id, {
        rank: i + 1,
        similarity: Math.max(0, 1 - (r._score as number)),
        record: r,
      })
    }
  })

  const keyMap = new Map<string, { rank: number; record: T }>()
  keyResults.forEach((r, i) => {
    const id = r._id as string
    if (id != null && !keyMap.has(id)) {
      keyMap.set(id, { rank: i + 1, record: r })
    }
  })

  const fused = new Map<string, { rrfScore: number; similarity: number; record: T }>()

  for (const [id, v] of vecMap) {
    const keyRank = keyMap.get(id)?.rank ?? 0
    const rrfScore = 1 / (K + v.rank) + (keyRank > 0 ? 1 / (K + keyRank) : 0)
    fused.set(id, { rrfScore, similarity: v.similarity, record: v.record })
  }

  for (const [id, kEntry] of keyMap) {
    if (!vecMap.has(id)) {
      fused.set(id, { rrfScore: 1 / (K + kEntry.rank), similarity: 0, record: kEntry.record })
    }
  }

  return [...fused.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit)
    .map(item => ({
      ...item.record,
      _score: item.similarity,
    })) as T[]
}
