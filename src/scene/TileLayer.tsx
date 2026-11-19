import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, Color, Matrix4, type InstancedMesh, type MeshStandardMaterial } from 'three';
import { TILE_COUNT, tileCoords } from '../game/grid';
import type { Tile } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { TILE_HEIGHT, hash01, indexToWorld } from './coords';
import { fbm } from './noise';
import { PALETTE } from './palette';
import { addSeasonal } from './season';

const C = {
  grassA: new Color(PALETTE.grassA),
  grassB: new Color(PALETTE.grassB),
  grassDry: new Color(PALETTE.grassDry),
  lockedTint: new Color(PALETTE.lockedTint),
  tilled: new Color(PALETTE.tilled),
  planted: new Color(PALETTE.planted),
  watered: new Color(PALETTE.watered),
  structure: new Color(PALETTE.structureGround),
  fertilized: new Color(PALETTE.fertilizedSoil),
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
  // Fertilized soil is darker and richer.
  if (tile.fertilized) return soilColor(tile, index, target).lerp(C.fertilized, 0.35);
  return soilColor(tile, index, target);
};

const soilColor = (tile: Tile, index: number, target: Color): Color => {
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
  // The ground follows the season's tint.
  const unregister = useRef<(() => void) | null>(null);
  const seasonalRef = (material: MeshStandardMaterial | null) => {
    unregister.current?.();
    unregister.current = material ? addSeasonal(material) : null;
  };

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

  // Road mode paints: press places the first tile (with error feedback), dragging adds more silently.
  const painting = useRef(false);
  const roadMode = () => useGameStore.getState().buildMode === 'road';

  // Tool mode drags an area: press starts it, moving extends it, releasing anywhere queues it.
  useEffect(() => {
    const onRelease = (e: PointerEvent) => {
      if (e.button === 0) useGameStore.getState().finishArea();
    };
    window.addEventListener('pointerup', onRelease);
    return () => window.removeEventListener('pointerup', onRelease);
  }, []);

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    const store = useGameStore.getState();
    const changed = store.hoveredTile !== e.instanceId;
    store.setHoveredTile(e.instanceId);
    if (store.area) store.extendArea(e.instanceId);
    if (painting.current && changed && (e.buttons & 1) === 1 && roadMode()) store.paintRoadAt(e.instanceId);
  };
  const onLeave = () => useGameStore.getState().setHoveredTile(null);
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || e.instanceId === undefined) return;
    const store = useGameStore.getState();
    if (roadMode()) {
      e.stopPropagation();
      painting.current = true;
      store.interactAt(e.instanceId);
      return;
    }
    // Building and the hand (camera drag, selection) answer to plain clicks instead of areas.
    if (store.buildMode || store.tool === null) return;
    // Land for sale answers to plain clicks.
    const tile = store.game.tiles[e.instanceId];
    if (!tile || tile.state === 'locked') return;
    e.stopPropagation();
    store.beginArea(e.instanceId);
  };
  const onUp = () => {
    painting.current = false;
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.button !== 0 || e.delta > CLICK_TOLERANCE || e.instanceId === undefined) return;
    if (roadMode()) return; // already handled on pointer down
    useGameStore.getState().interactAt(e.instanceId);
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, TILE_COUNT]}
      receiveShadow
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onClick={onClick}
    >
      <meshStandardMaterial ref={seasonalRef} roughness={1} />
    </instancedMesh>
  );
}
