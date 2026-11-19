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
  'coldRoom',
  'lampPost',
  'flowerBed',
  'bench',
  'scarecrow',
  'tree',
  'fountain',
  'greenhouse',
] as const;
export type StructureId = (typeof STRUCTURE_IDS)[number];

export type StructureCategory = 'housing' | 'farming' | 'animals' | 'storage' | 'decor';

/** Shelter levels: basic, reinforced, comfortable, automated. */
export type ShelterLevel = 1 | 2 | 3 | 4;
export const SHELTER_LEVEL_IDS: readonly ShelterLevel[] = [1, 2, 3, 4];

export interface ShelterLevelDef {
  label: string;
  /** 0–1: how pleasant the shelter is (shown to the player; drives production). */
  comfort: number;
  /** 0–1: protection against predators and disease (takes effect in stage 3d). */
  safety: number;
  /** Multiplies how fast the animals produce. */
  production: number;
  /** Multiplies the shelter's base capacity (heads); the product stock follows. */
  capacity: number;
  /** Upgrade price and work, as a share of the shelter's build cost and minutes (level 1: none). */
  upgradeShare: number;
}

export const SHELTER_LEVELS: Record<ShelterLevel, ShelterLevelDef> = {
  1: { label: 'Básico', comfort: 0.4, safety: 0.4, production: 1, capacity: 1, upgradeShare: 0 },
  2: { label: 'Reforçado', comfort: 0.55, safety: 0.7, production: 1.1, capacity: 4 / 3, upgradeShare: 0.6 },
  3: { label: 'Confortável', comfort: 0.8, safety: 0.75, production: 1.25, capacity: 5 / 3, upgradeShare: 1 },
  4: { label: 'Automatizado', comfort: 0.9, safety: 0.85, production: 1.3, capacity: 2, upgradeShare: 1.6 },
};

/** Highest level that can be reached for now (the automated level comes in a later stage). */
export const SHELTER_LEVEL_LIMIT: ShelterLevel = 3;

/** An animal shelter: which species live there and how many heads fit at level 1. */
export interface ShelterDef {
  species: readonly AnimalId[];
  capacity: number;
  /** Highest level this shelter type can have (the stable has no automation). Default 4. */
  maxLevel?: ShelterLevel;
  /** Extra safety from level 2 on (the coop's wire mesh). */
  safetyBonus?: number;
  /** What each level adds to this shelter (pt-BR), shown in its card. */
  perks: Partial<Record<ShelterLevel, string>>;
}

/** Room a storage building adds (units of goods). */
export interface StorageDef {
  capacity: number;
  /** Only grain (the silo). */
  grainOnly?: boolean;
  /** Refrigerated: what is kept here does not spoil. */
  cold?: boolean;
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
  /** Present on storage buildings. */
  storage?: StorageDef;
  /**
   * A cover over plantable ground (the greenhouse): its tiles get `Tile.cover` instead of
   * `Tile.structure`, so they can still be tilled, planted and harvested underneath.
   */
  cover?: boolean;
  /** Present on lights: shelters whose door is within `radius` tiles gain `safety` (see LIGHT_SAFETY_CAP). */
  light?: { radius: number; safety: number };
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
    shelter: {
      species: ['chicken', 'duck'],
      capacity: 12,
      safetyBonus: 0.1,
      perks: { 2: 'Tela no cercado contra predadores', 3: 'Ninhos forrados e poleiros', 4: 'Coletor automático de ovos' },
    },
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
    shelter: {
      species: ['pig'],
      capacity: 4,
      perks: { 2: 'Piso de concreto na baia', 3: 'Esterqueira: 50% mais esterco para adubo', 4: 'Comedouro automático' },
    },
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
    shelter: {
      species: ['sheep', 'goat'],
      capacity: 6,
      perks: { 2: 'Cerca alta e porteira', 3: 'Cama de palha e cocho coberto', 4: 'Tosquia e ordenha mecânicas' },
    },
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
    shelter: {
      species: ['cow', 'ox'],
      capacity: 4,
      perks: { 2: 'Porteira de metal', 3: 'Cocho coberto e bebedouro', 4: 'Ordenhadeira' },
    },
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
    shelter: {
      species: ['horse'],
      capacity: 3,
      maxLevel: 3,
      perks: { 2: 'Baias forradas', 3: 'Selaria e cocheira' },
    },
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
    storage: { capacity: 80, grainOnly: true },
    description: 'Guarda 80 de grãos (trigo e milho), que não estragam.',
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
    storage: { capacity: 60 },
    description: 'Guarda 60 de colheita e produtos.',
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
    storage: { capacity: 100 },
    description: 'Guarda 100 de colheita e produtos animais.',
  },
  coldRoom: {
    id: 'coldRoom',
    label: 'Câmara fria',
    icon: '🧊',
    width: 2,
    depth: 2,
    cost: 600,
    buildMinutes: 720,
    category: 'storage',
    storage: { capacity: 30, cold: true },
    description: 'Refrigerada: guarda 30 de perecíveis (leite, ovos, tomate) sem estragar.',
  },
  lampPost: {
    id: 'lampPost',
    label: 'Poste de luz',
    icon: '💡',
    width: 1,
    depth: 1,
    cost: 90,
    buildMinutes: 60,
    category: 'decor',
    light: { radius: 4, safety: 0.1 },
    description: 'Ilumina à noite: abrigos a até 4 tiles ganham +10% de segurança contra predadores.',
  },
  flowerBed: {
    id: 'flowerBed',
    label: 'Canteiro de flores',
    icon: '🌷',
    width: 1,
    depth: 1,
    cost: 40,
    buildMinutes: 30,
    category: 'decor',
    description: 'Canteiro elevado com flores coloridas.',
  },
  bench: {
    id: 'bench',
    label: 'Banco',
    icon: '🪑',
    width: 1,
    depth: 1,
    cost: 50,
    buildMinutes: 30,
    category: 'decor',
    description: 'Banco de jardim.',
  },
  scarecrow: {
    id: 'scarecrow',
    label: 'Espantalho',
    icon: '🎃',
    width: 1,
    depth: 1,
    cost: 60,
    buildMinutes: 30,
    category: 'decor',
    description: 'O clássico da roça.',
  },
  tree: {
    id: 'tree',
    label: 'Árvore',
    icon: '🌳',
    width: 1,
    depth: 1,
    cost: 30,
    buildMinutes: 20,
    category: 'decor',
    description: 'Uma árvore de sombra.',
  },
  fountain: {
    id: 'fountain',
    label: 'Chafariz',
    icon: '⛲',
    width: 2,
    depth: 2,
    cost: 450,
    buildMinutes: 240,
    category: 'decor',
    description: 'Chafariz de pedra para enfeitar a fazenda.',
  },
  greenhouse: {
    id: 'greenhouse',
    label: 'Estufa',
    icon: '🏡',
    width: 3,
    depth: 2,
    cost: 900,
    buildMinutes: 600,
    category: 'farming',
    cover: true,
    description: 'Cobre 6 tiles plantáveis: rega sozinha, ignora a estação, protege da tempestade e permite morango.',
  },
};

/** Most safety lights can add to one shelter. */
export const LIGHT_SAFETY_CAP = 0.2;

/** Structures that house animals, in menu order. */
export const SHELTER_IDS: readonly StructureId[] = STRUCTURE_IDS.filter((id) => STRUCTURES[id].shelter !== undefined);

/** Structures the player can build, in menu order. */
export const BUILDABLE_IDS: readonly StructureId[] = STRUCTURE_IDS.filter((id) => STRUCTURES[id].cost !== undefined);

export const CATEGORY_LABELS: Record<StructureCategory, string> = {
  housing: 'Moradia',
  animals: 'Animais',
  storage: 'Armazenamento',
  farming: 'Lavoura',
  decor: 'Decoração e iluminação',
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

/**
 * Structures present on a new game: a small yard near the south edge, facing the street (row 58)
 * that the access road comes up to. Each one starts with its road ring already open.
 */
export const START_STRUCTURES: readonly StructurePlacement[] = [
  { id: 'house', x: 30, y: 56 },
  { id: 'shippingBin', x: 33, y: 57 },
  { id: 'bunkhouse', x: 27, y: 57 },
];
