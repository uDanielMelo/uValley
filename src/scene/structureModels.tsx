import type { ComponentType, ReactNode } from 'react';
import type { StructureId } from '../data/structures';
import { footprintOf } from '../game/structures';
import type { Rotation } from '../game/types';
import { cornerToWorld } from './coords';
import { Barn, Bunkhouse, ChickenCoop, ColdRoom, Greenhouse, Silo, Warehouse } from './models/Buildings';
import { Bench, FlowerBed, Fountain, LampPost, PlantedTree, Scarecrow } from './models/Decor';
import { House } from './models/House';
import { Corral, Pigsty, Sheepfold, Stable } from './models/Shelters';
import { ShippingBin } from './models/ShippingBin';

export const STRUCTURE_MODELS: Record<StructureId, ComponentType> = {
  house: House,
  shippingBin: ShippingBin,
  bunkhouse: Bunkhouse,
  chickenCoop: ChickenCoop,
  pigsty: Pigsty,
  sheepfold: Sheepfold,
  corral: Corral,
  stable: Stable,
  silo: Silo,
  warehouse: Warehouse,
  barn: Barn,
  coldRoom: ColdRoom,
  lampPost: LampPost,
  flowerBed: FlowerBed,
  bench: Bench,
  scarecrow: Scarecrow,
  tree: PlantedTree,
  fountain: Fountain,
  greenhouse: Greenhouse,
};

export interface PlacedProps {
  type: StructureId;
  x: number;
  y: number;
  rotation: Rotation;
}

/** World transform for a structure footprint: centered on it, turned by quarter turns. */
export function StructureTransform({ type, x, y, rotation, children }: PlacedProps & { children: ReactNode }) {
  const fp = footprintOf(type, x, y, rotation);
  const [x0, z0] = cornerToWorld(fp.x, fp.y);
  return (
    <group position={[x0 + fp.width / 2, 0, z0 + fp.depth / 2]} rotation={[0, (rotation * Math.PI) / 2, 0]}>
      {children}
    </group>
  );
}
