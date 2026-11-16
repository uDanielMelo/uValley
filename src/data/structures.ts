/** Static structures placed on the grid. */

export const STRUCTURE_IDS = ['house', 'shippingBin'] as const;
export type StructureId = (typeof STRUCTURE_IDS)[number];

export interface StructureDef {
  id: StructureId;
  label: string;
  width: number;
  depth: number;
}

export const STRUCTURES: Record<StructureId, StructureDef> = {
  house: { id: 'house', label: 'Casa', width: 2, depth: 2 },
  shippingBin: { id: 'shippingBin', label: 'Caixa de venda', width: 1, depth: 1 },
};

export interface StructurePlacement {
  id: StructureId;
  /** Top-left tile of the footprint. */
  x: number;
  y: number;
}

/** Structures present on a new game. The house sits on the exact grid center. */
export const START_STRUCTURES: readonly StructurePlacement[] = [
  { id: 'house', x: 15, y: 15 },
  { id: 'shippingBin', x: 17, y: 16 },
];
