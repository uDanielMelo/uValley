import { useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, Color, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';
import { HIGHWAY, OFFMAP_ROAD_LENGTH } from '../data/roads';
import { PROP_SIZES, meters } from '../data/scale';
import { TILE_COUNT, inBounds, tileCoords, tileIndex } from '../game/grid';
import type { Tile } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { hash01, tileToWorld } from './coords';
import { PALETTE } from './palette';
import { HIGHWAY_HALF_WIDTH, HIGHWAY_Z, OFFMAP_ROAD_DIR, OFFMAP_ROAD_X, OFFMAP_ROAD_Z } from './terrain';

const noRaycast = () => null;
const WIDTH = meters(PROP_SIZES.roadWidth);
const THICKNESS = 0.024;
/** Length of an arm from the center patch to the tile edge. */
const ARM = (1 - WIDTH) / 2;
/** Center patch + up to 4 arms per road tile. */
const MAX_PIECES = TILE_COUNT * 5;
/** Terrain height of the graded corridor outside the farm. */
const CORRIDOR_Y = -0.02;
/** Highway length on each side of the junction, running on past the fog. */
const HIGHWAY_HALF_LENGTH = HIGHWAY.reach + 40;
const LINE = meters(PROP_SIZES.highwayLine);
const DASH = meters(PROP_SIZES.highwayDash);
const DASH_PERIOD = DASH + meters(PROP_SIZES.highwayDashGap);
const DASH_COUNT = Math.ceil((2 * HIGHWAY_HALF_LENGTH) / DASH_PERIOD);

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const isRoad = (tiles: readonly Tile[], x: number, y: number): boolean =>
  inBounds(x, y) && !!tiles[tileIndex(x, y)]?.road;

/** Dirt roads: a patch per road tile plus arms toward connected neighbours, and the road beyond the map. */
export function RoadLayer() {
  const meshRef = useRef<InstancedMesh>(null);
  const tiles = useGameStore((s) => s.game.tiles);
  const geometry = useMemo(() => new BoxGeometry(1, THICKNESS, 1), []);
  // The dirt road runs from the map border into the highway's edge.
  const offMapLength = OFFMAP_ROAD_LENGTH - HIGHWAY_HALF_WIDTH + 0.05;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const pos = new Vector3();
    const scale = new Vector3();
    const base = new Color(PALETTE.road);
    const color = new Color();
    let count = 0;
    const put = (x: number, y: number, z: number, sx: number, sz: number, shade: number) => {
      m.compose(pos.set(x, y, z), q, scale.set(sx, 1, sz));
      mesh.setMatrixAt(count, m);
      mesh.setColorAt(count, color.copy(base).multiplyScalar(shade));
      count++;
    };
    tiles.forEach((tile, i) => {
      if (!tile.road) return;
      const { x, y } = tileCoords(i);
      const [cx, cz] = tileToWorld(x, y);
      // Sits on the tile top (land for sale is a little lower).
      const top = (tile.state === 'locked' ? -0.02 : 0) + THICKNESS / 2 - 0.006;
      const shade = 0.95 + hash01(i * 7) * 0.08;
      put(cx, top, cz, WIDTH, WIDTH, shade);
      for (const [dx, dy] of NEIGHBOURS) {
        // The access road also continues past the map edge.
        const connected = isRoad(tiles, x + dx, y + dy) || (!inBounds(x + dx, y + dy) && dy === OFFMAP_ROAD_DIR);
        if (!connected) continue;
        const offset = WIDTH / 2 + ARM / 2;
        if (dx !== 0) put(cx + dx * offset, top, cz, ARM + 0.002, WIDTH, shade);
        else put(cx, top, cz + dy * offset, WIDTH, ARM + 0.002, shade);
      }
    });
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [tiles]);

  return (
    <group>
      <instancedMesh ref={meshRef} args={[geometry, undefined, MAX_PIECES]} receiveShadow raycast={noRaycast}>
        <meshStandardMaterial roughness={1} />
      </instancedMesh>
      {/* The road beyond the map edge, on the graded corridor. */}
      <mesh
        position={[OFFMAP_ROAD_X, CORRIDOR_Y + THICKNESS / 2 - 0.006, OFFMAP_ROAD_Z + (OFFMAP_ROAD_DIR * offMapLength) / 2]}
        receiveShadow
        raycast={noRaycast}
      >
        <boxGeometry args={[WIDTH, THICKNESS, offMapLength]} />
        <meshStandardMaterial color={PALETTE.road} roughness={1} />
      </mesh>
      <Highway />
    </group>
  );
}

/** The paved two-lane highway the access road meets, running along X beyond the farm edge. */
function Highway() {
  const dashRef = useRef<InstancedMesh>(null);
  const top = CORRIDOR_Y + THICKNESS;
  const length = 2 * HIGHWAY_HALF_LENGTH;
  const edgeOffset = HIGHWAY_HALF_WIDTH - LINE * 2.5;

  useLayoutEffect(() => {
    const mesh = dashRef.current;
    if (!mesh) return;
    const m = new Matrix4();
    for (let i = 0; i < DASH_COUNT; i++) {
      m.makeTranslation(OFFMAP_ROAD_X - HIGHWAY_HALF_LENGTH + (i + 0.5) * DASH_PERIOD, top + 0.002, HIGHWAY_Z);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [top]);

  return (
    <group>
      <mesh position={[OFFMAP_ROAD_X, top - THICKNESS / 2, HIGHWAY_Z]} receiveShadow raycast={noRaycast}>
        <boxGeometry args={[length, THICKNESS, HIGHWAY_HALF_WIDTH * 2]} />
        <meshStandardMaterial color={PALETTE.asphalt} roughness={0.95} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[OFFMAP_ROAD_X, top + 0.002, HIGHWAY_Z + side * edgeOffset]} raycast={noRaycast}>
          <boxGeometry args={[length, 0.004, LINE]} />
          <meshStandardMaterial color={PALETTE.highwayEdgeLine} roughness={0.9} />
        </mesh>
      ))}
      <instancedMesh ref={dashRef} args={[undefined, undefined, DASH_COUNT]} raycast={noRaycast}>
        <boxGeometry args={[DASH, 0.004, LINE]} />
        <meshStandardMaterial color={PALETTE.highwayCenterLine} roughness={0.9} />
      </instancedMesh>
    </group>
  );
}
