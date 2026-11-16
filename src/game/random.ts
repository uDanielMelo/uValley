/** Deterministic pseudo-random in [0, 1) from an integer seed (no state, safe in pure logic). */
export const hash01 = (seed: number): number => {
  let h = (seed | 0) * 374761393 + 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
