import type { ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, Color, Matrix4, type InstancedMesh } from 'three';
import { TILE_COUNT, tileCoords } from '../game/grid';
import type { Tile } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { TILE_HEIGHT, hash01, indexToWorld } from './coords';
import { fbm } from './noise';
import { PALETTE } from './palette';

const C = {
  grassA: new Color(PALETTE.grassA),
  grassB: new Color(PALETTE.grassB),
  grassDry: new Color(PALETTE.grassDry),
  lockedTint: new Color(PALETTE.lockedTint),
  tilled: new Color(PALETTE.tilled),
  planted: new Color(PALETTE.planted),
  watered: new Color(PALETTE.watered),
  structure: new Color(PALETTE.structureGround),
};

/** Max pointer travel (px) for a click to count as a click and not a drag. */
const CLICK_TOLERANCE = 5;

/** Natural grass color for a tile: two greens blended by low-frequency noise, with dry patches. */
const grassColor = (index: number, target: Color): Color => {
  const { x, y } = tileCoords(index);
  target.copy(C.grassA).lerp(C.grassB, fbm(x * 0.12, y * 0.12, 3, 1));
  target.lerp(C.grassDry, Math.max(0, fbm(x * 0.08 + 40, y * 0.08, 2, 7) - 0.55) * 1.2);
  return target.multiplyScalar(0.985 + hash01(index * 31) * 0.03);
};

const tileColor = (tile: Tile, index: number, target: Color): Color => {
  if (tile.structure) return target.copy(C.structure);
  switch (tile.state) {
    case 'locked':
      return grassColor(index, target).lerp(C.lockedTint, 0.35);
    case 'grass':
      return grassColor(index, target);
    case 'tilled':
      return target.copy(C.tilled).multiplyScalar(0.97 + hash01(index) * 0.06);
    case 'planted':
      return target.copy(C.planted).multiplyScalar(0.97 + hash01(index) * 0.06);
    case 'watered':
      return target.copy(C.watered);
  }
};

/** Vertical offset per state: land for sale sits a bit lower, worked soil slightly below grass. */
const tileOffset = (tile: Tile): number => {
  if (tile.state === 'locked') return -0.02;
  if (tile.state === 'grass' || tile.structure) return 0;
  return -0.04;
};

/** All 32x32 tiles in a single InstancedMesh, also the raycast target for hover/click. */
export function TileLayer() {
  const meshRef = useRef<InstancedMesh>(null);
  const tiles = useGameStore((s) => s.game.tiles);
  const geometry = useMemo(() => new BoxGeometry(1, TILE_HEIGHT, 1), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const m = new Matrix4();
    const color = new Color();
    tiles.forEach((tile, i) => {
      const [wx, wz] = indexToWorld(i);
      m.makeTranslation(wx, -TILE_HEIGHT / 2 + tileOffset(tile), wz);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, tileColor(tile, i, color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [tiles]);

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined) useGameStore.getState().setHoveredTile(e.instanceId);
  };
  const onLeave = () => useGameStore.getState().setHoveredTile(null);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.button !== 0 || e.delta > CLICK_TOLERANCE || e.instanceId === undefined) return;
    useGameStore.getState().interactAt(e.instanceId);
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, TILE_COUNT]}
      receiveShadow
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onClick={onClick}
    >
      <meshStandardMaterial roughness={1} />
    </instancedMesh>
  );
}
