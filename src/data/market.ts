/** The town's market, orders and the farm's vehicle. All balancing for selling in town lives here. */

import type { AnimalProductId } from './animals';
import type { CropId } from './crops';

/** Weight (kg) of one unit of each good, for the vehicle's load. */
export const CROP_WEIGHT: Record<CropId, number> = {
  wheat: 10,
  corn: 10,
  tomato: 5,
  carrot: 5,
  potato: 10,
  pumpkin: 15,
  strawberry: 2,
  orange: 5,
  apple: 5,
};
export const PRODUCT_WEIGHT: Record<AnimalProductId, number> = {
  egg: 1,
  duckEgg: 1,
  truffle: 1,
  wool: 4,
  fineWool: 4,
  goatMilk: 5,
  milk: 10,
};

export type VehicleLevel = 1 | 2 | 3;
export const VEHICLE_LEVELS: readonly VehicleLevel[] = [1, 2, 3];

export interface VehicleDef {
  label: string;
  icon: string;
  /** Load (kg) the freight takes per trip with this vehicle. */
  capacity: number;
  /** Price to trade up to it at the dealership (0 for the starting pickup). */
  price: number;
  /** Size of the figure on the road. */
  scale: number;
  color: string;
}

export const VEHICLES: Record<VehicleLevel, VehicleDef> = {
  1: { label: 'Picape', icon: '🛻', capacity: 250, price: 0, scale: 1, color: '#c0392b' },
  2: { label: 'Caminhonete', icon: '🚙', capacity: 600, price: 3500, scale: 1.15, color: '#2e6da4' },
  3: { label: 'Caminhão', icon: '🚚', capacity: 1500, price: 9000, scale: 1.4, color: '#3f7d4a' },
};

/** Town buyers pay this much more than the reference price (the goods have to get there, by freight). */
export const MARKET_BONUS = 1.25;

// ---------- orders ----------

export const TOWN_SHOP_IDS = ['bakery', 'restaurant', 'tailor', 'dairy'] as const;
export type TownShopId = (typeof TOWN_SHOP_IDS)[number];

export type OrderGood = { kind: 'crop'; id: CropId } | { kind: 'product'; id: AnimalProductId };

export interface TownShopDef {
  id: TownShopId;
  label: string;
  icon: string;
  /** What it orders. */
  wants: readonly OrderGood[];
}

export const TOWN_SHOPS: Record<TownShopId, TownShopDef> = {
  bakery: {
    id: 'bakery',
    label: 'Padaria',
    icon: '🥖',
    wants: [
      { kind: 'crop', id: 'wheat' },
      { kind: 'product', id: 'egg' },
      { kind: 'product', id: 'milk' },
      { kind: 'crop', id: 'strawberry' },
      { kind: 'crop', id: 'apple' },
    ],
  },
  restaurant: {
    id: 'restaurant',
    label: 'Restaurante',
    icon: '🍽️',
    wants: [
      { kind: 'crop', id: 'tomato' },
      { kind: 'crop', id: 'corn' },
      { kind: 'crop', id: 'carrot' },
      { kind: 'crop', id: 'potato' },
      { kind: 'crop', id: 'pumpkin' },
      { kind: 'crop', id: 'orange' },
      { kind: 'product', id: 'truffle' },
      { kind: 'product', id: 'duckEgg' },
    ],
  },
  tailor: {
    id: 'tailor',
    label: 'Ateliê',
    icon: '🧵',
    wants: [
      { kind: 'product', id: 'wool' },
      { kind: 'product', id: 'fineWool' },
    ],
  },
  dairy: {
    id: 'dairy',
    label: 'Laticínio',
    icon: '🧀',
    wants: [
      { kind: 'product', id: 'milk' },
      { kind: 'product', id: 'goatMilk' },
    ],
  },
};

export const ORDERS = {
  /** Most orders open at once. */
  maxOpen: 3,
  /** Units asked, as a range scaled by how cheap the good is (cheap goods come in bigger lots). */
  quantity: [4, 12] as const,
  /** Pays the base price × this range. */
  reward: [1.6, 2.1] as const,
  /** Days to deliver (an order expires at the start of its due day + 1). */
  days: [2, 4] as const,
  /** Chance a new order appears at each midnight while there is room. */
  chance: 0.8,
};
