/** Player-built fences and gates. Balancing only, no logic. */

export type FenceMaterialId = 'post' | 'rail' | 'wire' | 'hinge';

/** What a fence is made of: shown while dragging, and what the price is made of (no stock of its own). */
export const FENCE_MATERIALS: Record<FenceMaterialId, { label: string; unit: string; price: number }> = {
  post: { label: 'Poste de madeira', unit: 'un', price: 1.5 },
  rail: { label: 'Tábua', unit: 'un', price: 1 },
  wire: { label: 'Arame', unit: 'm', price: 0.1 },
  hinge: { label: 'Dobradiça', unit: 'un', price: 2 },
};

/** One tile of fence: straight, diagonal (√2 longer) or a gate. */
export type FencePiece = 'straight' | 'diagonal' | 'gate';

/** Materials per tile; the price of a tile is the sum, rounded up. */
export const FENCE_RECIPES: Record<FencePiece, Partial<Record<FenceMaterialId, number>>> = {
  straight: { post: 1, rail: 2, wire: 4 },
  diagonal: { post: 1, rail: 3, wire: 6 },
  gate: { post: 2, rail: 4, hinge: 2 },
};

/** Work minutes (at work speed 1) to build a fence tile, remove one, or build a gate. */
export const FENCE_WORK_MINUTES = { build: 15, remove: 8, gate: 25 } as const;
