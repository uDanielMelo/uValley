/** Structures placed on the grid. */

export const STRUCTURE_IDS = ['house', 'shippingBin', 'bunkhouse', 'chickenCoop', 'silo', 'warehouse', 'barn'] as const;
export type StructureId = (typeof STRUCTURE_IDS)[number];

export type StructureCategory = 'housing' | 'animals' | 'storage';

/**
 * Footprints are in tiles of TILE_METERS (3.5 m, see data/scale.ts) and the models are built to
 * match real sizes: bunkhouse 7 × 3.5 m, coop 7 × 3.5 m, silo Ø 5 m × 12 m, warehouse 10.5 × 7 m, barn 10.5 × 10.5 m.
 */
export interface StructureDef {
  id: StructureId;
  label: string;
  icon: string;
  width: number;
  depth: number;
  /** Price to build. Absent: the structure cannot be built or demolished by the player. */
  cost?: number;
  category?: StructureCategory;
  /** Short pt-BR description for the build menu. */
  description: string;
}

export const STRUCTURES: Record<StructureId, StructureDef> = {
  house: { id: 'house', label: 'Casa', icon: '🏠', width: 2, depth: 2, description: 'A casa da família.' },
  shippingBin: {
    id: 'shippingBin',
    label: 'Caixa de venda',
    icon: '📦',
    width: 1,
    depth: 1,
    description: 'Venda sua colheita aqui.',
  },
  bunkhouse: {
    id: 'bunkhouse',
    label: 'Alojamento',
    icon: '🛏️',
    width: 2,
    depth: 1,
    cost: 300,
    category: 'housing',
    description: 'Casa dos trabalhadores fixos: 3 camas.',
  },
  chickenCoop: {
    id: 'chickenCoop',
    label: 'Galinheiro',
    icon: '🐔',
    width: 2,
    depth: 1,
    cost: 150,
    category: 'animals',
    description: 'Casinha e cercado telado para galinhas e patas.',
  },
  silo: {
    id: 'silo',
    label: 'Silo',
    icon: '🌾',
    width: 2,
    depth: 2,
    cost: 250,
    category: 'storage',
    description: 'Guarda grãos e ração.',
  },
  warehouse: {
    id: 'warehouse',
    label: 'Armazém',
    icon: '🏭',
    width: 3,
    depth: 2,
    cost: 350,
    category: 'storage',
    description: 'Estoque extra de colheita e produtos.',
  },
  barn: {
    id: 'barn',
    label: 'Celeiro',
    icon: '🛖',
    width: 3,
    depth: 3,
    cost: 400,
    category: 'animals',
    description: 'Abrigo para vacas, bois, cavalos e porcos.',
  },
};

/** Structures the player can build, in menu order. */
export const BUILDABLE_IDS: readonly StructureId[] = STRUCTURE_IDS.filter((id) => STRUCTURES[id].cost !== undefined);

export const CATEGORY_LABELS: Record<StructureCategory, string> = {
  housing: 'Moradia',
  animals: 'Animais',
  storage: 'Armazenamento',
};

/** Fraction of the build cost refunded when demolishing. */
export const DEMOLISH_REFUND = 0.5;

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
  { id: 'bunkhouse', x: 12, y: 16 },
];
