import type { ThreeEvent } from '@react-three/fiber';
import type { ComponentType, ReactNode } from 'react';
import type { StructureId } from '../data/structures';
import { footprintOf } from '../game/structures';
import type { Rotation } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { cornerToWorld } from './coords';
import { Barn, Bunkhouse, ChickenCoop, Silo, Warehouse } from './models/Buildings';
import { House } from './models/House';
import { ShippingBin } from './models/ShippingBin';

export const STRUCTURE_MODELS: Record<StructureId, ComponentType> = {
  house: House,
  shippingBin: ShippingBin,
  bunkhouse: Bunkhouse,
  chickenCoop: ChickenCoop,
  silo: Silo,
  warehouse: Warehouse,
  barn: Barn,
};

/** Click handlers per structure (structures without one let clicks fall through to tiles). */
const ON_CLICK: Partial<Record<StructureId, () => void>> = {
  shippingBin: () => useGameStore.getState().showPanel('inventory'),
  bunkhouse: () => useGameStore.getState().showPanel('workers'),
};

interface PlacedProps {
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

const stopDown = (e: ThreeEvent<PointerEvent>) => {
  if (e.button === 0 && !useGameStore.getState().buildMode) e.stopPropagation();
};

function PlacedStructure({ type, x, y, rotation }: PlacedProps) {
  const Model = STRUCTURE_MODELS[type];
  const handler = ON_CLICK[type];
  const onClick = handler
    ? (e: ThreeEvent<MouseEvent>) => {
        // In build mode clicks go to the tile under the cursor instead.
        if (e.button !== 0 || useGameStore.getState().buildMode) return;
        e.stopPropagation();
        handler();
      }
    : undefined;
  return (
    <group
      onClick={onClick}
      onPointerDown={handler ? stopDown : undefined}
      onPointerOver={handler ? () => (document.body.style.cursor = 'pointer') : undefined}
      onPointerOut={handler ? () => (document.body.style.cursor = '') : undefined}
    >
      <StructureTransform type={type} x={x} y={y} rotation={rotation}>
        <Model />
      </StructureTransform>
    </group>
  );
}

/** Renders the placed structures. The list only changes when something is built or demolished. */
export function Structures() {
  const structures = useGameStore((s) => s.game.structures);
  return (
    <group>
      {structures.map((s) => (
        <PlacedStructure key={s.id} type={s.type} x={s.x} y={s.y} rotation={s.rotation} />
      ))}
    </group>
  );
}
