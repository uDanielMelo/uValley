import type { ThreeEvent } from '@react-three/fiber';
import type { ComponentType } from 'react';
import { START_STRUCTURES, STRUCTURES, type StructureId } from '../data/structures';
import { useGameStore } from '../store/gameStore';
import { cornerToWorld } from './coords';
import { House } from './models/House';
import { ShippingBin } from './models/ShippingBin';

const MODELS: Record<StructureId, ComponentType> = {
  house: House,
  shippingBin: ShippingBin,
};

/** Click handlers per structure (structures without one let clicks fall through to tiles). */
const ON_CLICK: Partial<Record<StructureId, () => void>> = {
  shippingBin: () => useGameStore.getState().showPanel('inventory'),
};

/**
 * Renders the static structures. Phase 1 uses START_STRUCTURES directly;
 * when buildings become purchasable, read placements from the game state instead.
 */
export function Structures() {
  return (
    <group>
      {START_STRUCTURES.map((placement) => {
        const def = STRUCTURES[placement.id];
        const Model = MODELS[placement.id];
        const [x0, z0] = cornerToWorld(placement.x, placement.y);
        const handler = ON_CLICK[placement.id];
        const onClick = handler
          ? (e: ThreeEvent<MouseEvent>) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              handler();
            }
          : undefined;
        return (
          <group
            key={`${placement.id}-${placement.x}-${placement.y}`}
            position={[x0 + def.width / 2, 0, z0 + def.depth / 2]}
            onClick={onClick}
            onPointerOver={handler ? () => (document.body.style.cursor = 'pointer') : undefined}
            onPointerOut={handler ? () => (document.body.style.cursor = '') : undefined}
          >
            <Model />
          </group>
        );
      })}
    </group>
  );
}
