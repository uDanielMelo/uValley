/** Returns a copy of counts with `delta` added to `id`. Entries reaching 0 are removed. */
export const addCount = <K extends string>(
  counts: Partial<Record<K, number>>,
  id: K,
  delta: number,
): Partial<Record<K, number>> => {
  const value = (counts[id] ?? 0) + delta;
  const next: Partial<Record<K, number>> = { ...counts };
  if (value > 0) next[id] = value;
  else delete next[id];
  return next;
};
