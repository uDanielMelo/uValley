import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';
import { PROP_SIZES, meters } from '../data/scale';
import { GRID_SIZE } from '../data/world';
import { inBounds, tileCoords, tileIndex } from '../game/grid';
import type { Tile } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { tileToWorld } from './coords';
import { PALETTE } from './palette';

const TILE_COUNT = GRID_SIZE * GRID_SIZE;
/** Room for 4 links per fence tile (more only in odd X shapes, which are clamped). */
const MAX_RAILS = TILE_COUNT * 4 * PROP_SIZES.fenceRails.length;
const MAX_POSTS = TILE_COUNT * 2;
const MAX_LEAVES = TILE_COUNT * 2;
const RAIL_HEIGHTS = PROP_SIZES.fenceRails.map(meters);
const POST_HEIGHT = meters(PROP_SIZES.fenceHeight);
const LEAF_HEIGHT = meters(PROP_SIZES.fenceRails[1] ?? 0.95) + meters(PROP_SIZES.fenceRail);
const UP = new Vector3(0, 1, 0);

type Dir = readonly [number, number];
const ORTHOGONAL: readonly Dir[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAGONAL: readonly Dir[] = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

const fenceAt = (tiles: readonly Tile[], x: number, y: number): boolean =>
  inBounds(x, y) && tiles[tileIndex(x, y)]?.fence !== undefined;

/** Directions this fence tile links to: every fenced side, and a fenced corner when neither side next to it is fenced. */
const linksOf = (tiles: readonly Tile[], x: number, y: number): Dir[] => [
  ...ORTHOGONAL.filter(([dx, dy]) => fenceAt(tiles, x + dx, y + dy)),
  ...DIAGONAL.filter(
    ([dx, dy]) => fenceAt(tiles, x + dx, y + dy) && !fenceAt(tiles, x + dx, y) && !fenceAt(tiles, x, y + dy),
  ),
];

/** Span direction of a gate: the line through its links (x by default). */
const gateAxis = (links: readonly Dir[]): Dir => {
  const opposite = links.find(([dx, dy]) => links.some(([ex, ey]) => ex === -dx && ey === -dy));
  return opposite ?? links[0] ?? [1, 0];
};

const yaw = (dx: number, dz: number) => new Quaternion().setFromAxisAngle(UP, -Math.atan2(dz, dx));

/** Player-built fences and gates: a post per tile, rails to each linked neighbour, swinging gate leaves. */
export function FenceLayer() {
  const tiles = useGameStore((s) => s.game.tiles);
  const railRef = useRef<InstancedMesh>(null);
  const postRef = useRef<InstancedMesh>(null);
  const leafRef = useRef<InstancedMesh>(null);
  const railGeometry = useMemo(() => new BoxGeometry(1, meters(PROP_SIZES.fenceRail), meters(PROP_SIZES.fenceRail) * 0.6), []);
  const postGeometry = useMemo(
    () => new BoxGeometry(meters(PROP_SIZES.fencePost), POST_HEIGHT, meters(PROP_SIZES.fencePost)),
    [],
  );
  const leafGeometry = useMemo(() => new BoxGeometry(1, LEAF_HEIGHT, meters(PROP_SIZES.fenceRail) * 0.5), []);
  useEffect(
    () => () => {
      railGeometry.dispose();
      postGeometry.dispose();
      leafGeometry.dispose();
    },
    [railGeometry, postGeometry, leafGeometry],
  );

  useLayoutEffect(() => {
    const rails = railRef.current;
    const posts = postRef.current;
    const leaves = leafRef.current;
    if (!rails || !posts || !leaves) return;
    const m = new Matrix4();
    const pos = new Vector3();
    const scale = new Vector3();
    let r = 0;
    let p = 0;
    let l = 0;
    const post = (x: number, z: number) => {
      if (p >= MAX_POSTS) return;
      posts.setMatrixAt(p++, m.makeTranslation(x, POST_HEIGHT / 2, z));
    };
    for (let index = 0; index < TILE_COUNT; index++) {
      const fence = tiles[index]?.fence;
      if (!fence) continue;
      const { x, y } = tileCoords(index);
      const [cx, cz] = tileToWorld(x, y);
      const links = linksOf(tiles, x, y);
      if (fence.gate) {
        // Two leaves hinged at the ends of the span, meeting in the middle when closed.
        const [ax, az] = gateAxis(links);
        const half = Math.hypot(ax, az) / 2;
        const len = Math.hypot(ax, az);
        const ux = ax / len;
        const uz = az / len;
        for (const side of [1, -1]) {
          const hx = cx + ux * half * side;
          const hz = cz + uz * half * side;
          post(hx, hz);
          // Closed: towards the centre; open: swung 90° to the same side.
          const dx = fence.open ? -uz : -ux * side;
          const dz = fence.open ? ux : -uz * side;
          if (l >= MAX_LEAVES) continue;
          m.compose(
            pos.set(hx + (dx * half) / 2, LEAF_HEIGHT / 2 + 0.02, hz + (dz * half) / 2),
            yaw(dx, dz),
            scale.set(half * 0.96, 1, 1),
          );
          leaves.setMatrixAt(l++, m);
        }
        continue;
      }
      post(cx, cz);
      for (const [dx, dy] of links) {
        // Half the way to the neighbour; it draws the other half.
        const length = Math.hypot(dx, dy) / 2;
        const q = yaw(dx, dy);
        for (const h of RAIL_HEIGHTS) {
          if (r >= MAX_RAILS) break;
          m.compose(pos.set(cx + dx / 4, h, cz + dy / 4), q, scale.set(length, 1, 1));
          rails.setMatrixAt(r++, m);
        }
      }
    }
    rails.count = r;
    posts.count = p;
    leaves.count = l;
    for (const mesh of [rails, posts, leaves]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [tiles]);

  return (
    <group>
      <instancedMesh ref={railRef} args={[railGeometry, undefined, MAX_RAILS]} castShadow>
        <meshStandardMaterial color={PALETTE.fence} flatShading />
      </instancedMesh>
      <instancedMesh ref={postRef} args={[postGeometry, undefined, MAX_POSTS]} castShadow>
        <meshStandardMaterial color={PALETTE.fencePost} flatShading />
      </instancedMesh>
      <instancedMesh ref={leafRef} args={[leafGeometry, undefined, MAX_LEAVES]} castShadow>
        <meshStandardMaterial color={PALETTE.fenceGate} flatShading />
      </instancedMesh>
    </group>
  );
}
