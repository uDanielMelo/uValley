import { ANIMAL_PRODUCTS } from '../data/animals';
import { CROPS } from '../data/crops';
import type { Good } from '../game/market';

/** Name and icon of a good (pt-BR). */
export const goodName = (good: Good): { label: string; icon: string } =>
  good.kind === 'crop' ? CROPS[good.id] : ANIMAL_PRODUCTS[good.id];
