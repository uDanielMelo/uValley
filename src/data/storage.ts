/** Storage and spoilage. All balancing for keeping goods lives here. */

import type { AnimalProductId } from './animals';
import type { CropId } from './crops';

/** Units the house pantry holds before goods are left out in the open. */
export const PANTRY_CAPACITY = 30;

/** Crops that go to the silo (grain); the rest needs general storage. */
export const GRAIN_CROPS: readonly CropId[] = ['wheat', 'corn'];

/** Share of each stack lost per game day in normal storage (0: keeps forever). */
export const CROP_SPOILAGE: Record<CropId, number> = {
  wheat: 0,
  corn: 0.02,
  tomato: 0.12,
};

export const PRODUCT_SPOILAGE: Record<AnimalProductId, number> = {
  egg: 0.06,
  duckEgg: 0.06,
  truffle: 0.08,
  wool: 0,
  fineWool: 0,
  goatMilk: 0.15,
  milk: 0.15,
};

/** Goods left out in the open (beyond storage) lose at least this share per day. */
export const OPEN_AIR_SPOILAGE = 0.25;
