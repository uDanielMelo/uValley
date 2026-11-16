import { useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';
import { GRID_SIZE } from '../data/world';
import { inBounds, tileIndex } from '../game/grid';
import type { Tile } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { cornerToWorld } from './coords';
import { PALETTE } from './palette';

/** A fence segment along one tile edge: start corner and direction ('x' or 'z'). */
interface Segment {
  cx: number;
  cy: number;
  axis: 'x' | 'z';
}

const MAX_SEGMENTS = GRID_SIZE * GRID_SIZE * 2;
const MAX_POSTS = (GRID_SIZE + 1) * (GRID_SIZE + 1);
const RAIL_HEIGHTS = [0.18, 0.36];

const isOpen = (tiles: readonly Tile[], x: number, y: number): boolean =>
  inBounds(x, y) && tiles[tileIndex(x, y)]?.state !== 'locked';

/** Fence segments on every edge between unlocked land and locked land / map border. */
const computeSegments = (tiles: readonly Tile[]): Segment[] => {
  const segments: Segment[] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (!isOpen(tiles, x, y)) continue;
      if (!isOpen(tiles, x, y - 1)) segments.push({ cx: x, cy: y, axis: 'x' });
      if (!isOpen(tiles, x, y + 1)) segments.push({ cx: x, cy: y + 1, axis: 'x' });
      if (!isOpen(tiles, x - 1, y)) segments.push({ cx: x, cy: y, axis: 'z' });
      if (!isOpen(tiles, x + 1, y)) segments.push({ cx: x + 1, cy: y, axis: 'z' });
    }
  }
  return segments;
};

/** Wooden fence around the owned land, rebuilt whenever plots are bought. */
export function Fences() {
  const unlockedPlots = useGameStore((s) => s.game.unlockedPlots);
  const railRef = useRef<InstancedMesh>(null);
  const postRef = useRef<InstancedMesh>(null);
  const railGeometry = useMemo(() => new BoxGeometry(1, 0.06, 0.05), []);
  const postGeometry = useMemo(() => new BoxGeometry(0.1, 0.5, 0.1), []);

  useLayoutEffect(() => {
    const rails = railRef.current;
    const posts = postRef.current;
    if (!rails || !posts) return;
    const segments = computeSegments(useGameStore.getState().game.tiles);
    const m = new Matrix4();
    const q = new Quaternion();
    const qz = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const one = new Vector3(1, 1, 1);
    const pos = new Vector3();
    let r = 0;
    const corners = new Set<string>();
    for (const s of segments) {
      const [x0, z0] = cornerToWorld(s.cx, s.cy);
      const midX = s.axis === 'x' ? x0 + 0.5 : x0;
      const midZ = s.axis === 'z' ? z0 + 0.5 : z0;
      for (const h of RAIL_HEIGHTS) {
        m.compose(pos.set(midX, h, midZ), s.axis === 'x' ? q.identity() : qz, one);
        rails.setMatrixAt(r++, m);
      }
      corners.add(`${s.cx},${s.cy}`);
      corners.add(s.axis === 'x' ? `${s.cx + 1},${s.cy}` : `${s.cx},${s.cy + 1}`);
    }
    let p = 0;
    for (const key of corners) {
      const [cx = 0, cy = 0] = key.split(',').map(Number);
      const [wx, wz] = cornerToWorld(cx, cy);
      m.makeTranslation(wx, 0.25, wz);
      posts.setMatrixAt(p++, m);
    }
    rails.count = r;
    posts.count = p;
    rails.instanceMatrix.needsUpdate = true;
    posts.instanceMatrix.needsUpdate = true;
    rails.computeBoundingSphere();
    posts.computeBoundingSphere();
  }, [unlockedPlots]);

  return (
    <group>
      <instancedMesh ref={railRef} args={[railGeometry, undefined, MAX_SEGMENTS * RAIL_HEIGHTS.length]} castShadow>
        <meshStandardMaterial color={PALETTE.fence} flatShading />
      </instancedMesh>
      <instancedMesh ref={postRef} args={[postGeometry, undefined, MAX_POSTS]} castShadow>
        <meshStandardMaterial color={PALETTE.fencePost} flatShading />
      </instancedMesh>
    </group>
  );
}
