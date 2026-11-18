/** Structures placed on the grid. */

import type { AnimalId } from './animals';

export const STRUCTURE_IDS = [
  'house',
  'shippingBin',
  'bunkhouse',
  'chickenCoop',
  'pigsty',
  'sheepfold',
  'corral',
  'stable',
  'silo',
  'warehouse',
  'barn',
] as const;
export type StructureId = (typeof STRUCTURE_IDS)[number];

export type StructureCategory = 'housing' | 'animals' | 'storage';

/** An animal shelter: which species live there and how many heads fit. */
export interface ShelterDef {
  species: readonly AnimalId[];
  capacity: number;
}

/**
 * Footprints are in tiles of TILE_METERS (3.5 m, see data/scale.ts) and the models are built to
 * match real sizes: bunkhouse 7 × 3.5 m, coop 7 × 3.5 m, pigsty 7 × 3.5 m, sheepfold 7 × 7 m,
 * corral 10.5 × 7 m, stable 7 × 7 m, silo Ø 5 m × 12 m, warehouse 10.5 × 7 m, barn 10.5 × 10.5 m.
 */
export interface StructureDef {
  id: StructureId;
  label: string;
  icon: string;
  width: number;
  depth: number;
  /** Price to build. Absent: the structure cannot be built or demolished by the player. */
  cost?: number;
  /** Work minutes (at work speed 1) the crew needs to raise it. Buildable structures only. */
  buildMinutes?: number;
  category?: StructureCategory;
  /** Present on animal shelters. */
  shelter?: ShelterDef;
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
    buildMinutes: 480,
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
    buildMinutes: 300,
    category: 'animals',
    shelter: { species: ['chicken', 'duck'], capacity: 12 },
    description: 'Casinha e cercado telado para galinhas e patas.',
  },
  pigsty: {
    id: 'pigsty',
    label: 'Chiqueiro',
    icon: '🐖',
    width: 2,
    depth: 1,
    cost: 250,
    buildMinutes: 360,
    category: 'animals',
    shelter: { species: ['pig'], capacity: 4 },
    description: 'Abrigo coberto e baia de lama para porcos.',
  },
  sheepfold: {
    id: 'sheepfold',
    label: 'Aprisco',
    icon: '🐑',
    width: 2,
    depth: 2,
    cost: 300,
    buildMinutes: 420,
    category: 'animals',
    shelter: { species: ['sheep', 'goat'], capacity: 6 },
    description: 'Galpão baixo e cercado para ovelhas e cabras.',
  },
  corral: {
    id: 'corral',
    label: 'Curral',
    icon: '🐄',
    width: 3,
    depth: 2,
    cost: 400,
    buildMinutes: 540,
    category: 'animals',
    shelter: { species: ['cow', 'ox'], capacity: 4 },
    description: 'Cobertura aberta e cerca de tábuas para vacas e bois.',
  },
  stable: {
    id: 'stable',
    label: 'Estábulo',
    icon: '🐎',
    width: 2,
    depth: 2,
    cost: 450,
    buildMinutes: 600,
    category: 'animals',
    shelter: { species: ['horse'], capacity: 3 },
    description: 'Baias individuais para cavalos.',
  },
  silo: {
    id: 'silo',
    label: 'Silo',
    icon: '🌾',
    width: 2,
    depth: 2,
    cost: 250,
    buildMinutes: 600,
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
    buildMinutes: 720,
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
    buildMinutes: 960,
    category: 'storage',
    description: 'Guarda colheita e produtos animais.',
  },
};

/** Structures that house animals, in menu order. */
export const SHELTER_IDS: readonly StructureId[] = STRUCTURE_IDS.filter((id) => STRUCTURES[id].shelter !== undefined);

/** Structures the player can build, in menu order. */
export const BUILDABLE_IDS: readonly StructureId[] = STRUCTURE_IDS.filter((id) => STRUCTURES[id].cost !== undefined);

export const CATEGORY_LABELS: Record<StructureCategory, string> = {
  housing: 'Moradia',
  animals: 'Animais',
  storage: 'Armazenamento',
};

/** Fraction of the build cost refunded when a demolition is finished. */
export const DEMOLISH_REFUND = 0.5;
/** Tearing down takes this fraction of the build work. */
export const DEMOLISH_WORK = 0.35;
/** Most workers on one site at a time (each takes a different side of the footprint). */
export const BUILD_CREW_MAX = 3;

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
