/**
 * Storage and spoilage. The house pantry and storage buildings hold the harvest and animal
 * products (seeds, medicine and fertilizer don't take room). Where each unit sits is derived,
 * never saved: grain fills the silos first, perishables the cold rooms, the rest general storage,
 * and what does not fit is left in the open. Every midnight perishables lose a share (more in
 * summer, less in winter); goods in the open lose much more, cold rooms and silos keep theirs.
 */
import { ANIMAL_PRODUCT_IDS, type AnimalProductId } from '../data/animals';
import { SEASONS } from '../data/climate';
import { CROP_IDS, type CropId } from '../data/crops';
import { CROP_SPOILAGE, GRAIN_CROPS, OPEN_AIR_SPOILAGE, PANTRY_CAPACITY, PRODUCT_SPOILAGE } from '../data/storage';
import { STRUCTURES } from '../data/structures';
import { seasonOf } from './climate';
import { addCount } from './inventory';
import { hash01 } from './random';
import { isOperational } from './structures';
import type { GameState, ItemCounts, ProductCounts } from './types';

export interface StorageCapacity {
  /** Pantry, warehouses and barns: any goods. */
  general: number;
  /** Silos: grain only. */
  grain: number;
  /** Cold rooms: perishables keep there. */
  cold: number;
}

/** Room from the house pantry and every finished storage building. */
export const storageCapacity = (state: Pick<GameState, 'structures'>): StorageCapacity => {
  const capacity: StorageCapacity = { general: PANTRY_CAPACITY, grain: 0, cold: 0 };
  for (const s of state.structures) {
    const def = STRUCTURES[s.type].storage;
    if (!def || !isOperational(s)) continue;
    if (def.cold) capacity.cold += def.capacity;
    else if (def.grainOnly) capacity.grain += def.capacity;
    else capacity.general += def.capacity;
  }
  return capacity;
};

/** One kind of stored good. */
type Good = { kind: 'crop'; id: CropId } | { kind: 'product'; id: AnimalProductId };

const GOODS: readonly Good[] = [
  ...CROP_IDS.map((id): Good => ({ kind: 'crop', id })),
  ...ANIMAL_PRODUCT_IDS.map((id): Good => ({ kind: 'product', id })),
];

const countOf = (state: Pick<GameState, 'inventory'>, good: Good): number =>
  good.kind === 'crop' ? (state.inventory.produce[good.id] ?? 0) : (state.inventory.products[good.id] ?? 0);

/** Share lost per day in normal storage, before the season. */
export const spoilRate = (good: Good): number => (good.kind === 'crop' ? CROP_SPOILAGE[good.id] : PRODUCT_SPOILAGE[good.id]);

const isGrain = (good: Good): boolean => good.kind === 'crop' && GRAIN_CROPS.includes(good.id);

interface Placement {
  good: Good;
  count: number;
  /** Units in a silo (they keep). */
  silo: number;
  /** Units in a cold room (they keep). */
  cold: number;
}

const keptOf = (p: Placement): number => p.silo + p.cold;

/** Where the goods sit: grain fills the silos, the most perishable goods the cold rooms. */
const place = (state: Pick<GameState, 'inventory'>, capacity: StorageCapacity): Placement[] => {
  const placements: Placement[] = GOODS.map((good) => ({ good, count: countOf(state, good), silo: 0, cold: 0 }));
  const stored = placements.filter((p) => p.count > 0);
  const byRate = (a: Placement, b: Placement) => spoilRate(b.good) - spoilRate(a.good);
  let grainRoom = capacity.grain;
  for (const p of stored.filter((x) => isGrain(x.good)).sort(byRate)) {
    p.silo = Math.min(p.count, grainRoom);
    grainRoom -= p.silo;
  }
  let coldRoom = capacity.cold;
  for (const p of stored.filter((x) => spoilRate(x.good) > 0).sort(byRate)) {
    p.cold = Math.min(p.count - p.silo, coldRoom);
    coldRoom -= p.cold;
  }
  return stored;
};

export interface StorageUse {
  capacity: StorageCapacity;
  /** All stored units. */
  total: number;
  grainUsed: number;
  coldUsed: number;
  /** Units in general storage (pantry, warehouses, barns), including what does not fit. */
  generalUsed: number;
  /** Units left in the open (beyond general storage). */
  openAir: number;
}

export const storageUse = (state: Pick<GameState, 'inventory' | 'structures'>): StorageUse => {
  const capacity = storageCapacity(state);
  const placements = place(state, capacity);
  const total = placements.reduce((sum, p) => sum + p.count, 0);
  const grainUsed = placements.reduce((sum, p) => sum + p.silo, 0);
  const coldUsed = placements.reduce((sum, p) => sum + p.cold, 0);
  const generalUsed = total - grainUsed - coldUsed;
  return { capacity, total, grainUsed, coldUsed, generalUsed, openAir: Math.max(0, generalUsed - capacity.general) };
};

export interface Spoiled {
  produce: ItemCounts;
  products: ProductCounts;
  total: number;
}

/** Rounds a fractional loss: whole part, plus one more with the fraction's chance (deterministic). */
const roundLoss = (loss: number, seed: number): number => Math.floor(loss) + (hash01(seed) < loss - Math.floor(loss) ? 1 : 0);

/**
 * Midnight spoilage for a new `day`: goods kept in silos and cold rooms are safe; the rest lose
 * their daily share (× the season), and the part left in the open loses at least OPEN_AIR_SPOILAGE.
 */
export const spoilGoods = (state: GameState, day: number): { state: GameState; spoiled: Spoiled } => {
  const capacity = storageCapacity(state);
  const placements = place(state, capacity);
  const exposed = placements.reduce((sum, p) => sum + p.count - keptOf(p), 0);
  const openAir = Math.max(0, exposed - capacity.general);
  const openShare = exposed > 0 ? openAir / exposed : 0;
  const season = SEASONS[seasonOf(day)].spoilage;
  const spoiled: Spoiled = { produce: {}, products: {}, total: 0 };
  let produce = state.inventory.produce;
  let products = state.inventory.products;
  placements.forEach((p, i) => {
    const loose = p.count - keptOf(p);
    if (loose <= 0) return;
    const rate = spoilRate(p.good) * season;
    const lossRate = (1 - openShare) * rate + openShare * Math.max(rate, OPEN_AIR_SPOILAGE);
    const lost = Math.min(loose, roundLoss(loose * lossRate, day * 7919 + i * 31 + 5));
    if (lost <= 0) return;
    spoiled.total += lost;
    if (p.good.kind === 'crop') {
      produce = addCount(produce, p.good.id, -lost);
      spoiled.produce = addCount(spoiled.produce, p.good.id, lost);
    } else {
      products = addCount(products, p.good.id, -lost);
      spoiled.products = addCount(spoiled.products, p.good.id, lost);
    }
  });
  if (spoiled.total === 0) return { state, spoiled };
  return { state: { ...state, inventory: { ...state.inventory, produce, products } }, spoiled };
};
