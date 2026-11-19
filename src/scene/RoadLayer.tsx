import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';
import { HIGHWAY, OFFMAP_ROAD_LENGTH } from '../data/roads';
import { PROP_SIZES, meters } from '../data/scale';
import { TILE_COUNT, inBounds, tileCoords, tileIndex } from '../game/grid';
import type { Tile } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { hash01, tileToWorld } from './coords';
import { merge } from './models/geometry';
import { PALETTE } from './palette';
import {
  E,
  N,
  PIECE_KINDS,
  S,
  W,
  junctionFillets,
  pieceFor,
  pieceGeometry,
  slab,
  straightRuts,
  type PieceKind,
  type PieceStyle,
} from './roadPieces';
import { HIGHWAY_HALF_WIDTH, HIGHWAY_Z, OFFMAP_ROAD_DIR, OFFMAP_ROAD_X, OFFMAP_ROAD_Z } from './terrain';

const noRaycast = () => null;
const STYLE: PieceStyle = {
  half: meters(PROP_SIZES.roadWidth) / 2,
  verge: 0.05,
  surfaceHeight: 0.024,
  vergeHeight: 0.016,
  // A pickup's track is about 1.6 m: each rut 0.8 m off the center line, 25 cm wide.
  rutOffset: meters(0.8),
  rutWidth: meters(0.25),
};
/** Pieces sink this much so their edges meet the ground without a gap. */
const SINK = 0.006;
/** Terrain height of the graded corridor outside the farm. */
const CORRIDOR_Y = -0.02;
/** Highway length on each side of the junction, running on past the fog. */
const HIGHWAY_HALF_LENGTH = HIGHWAY.reach + 40;
/** Radius (tiles) of the rounded widening where the access road meets the highway. */
const JUNCTION_FILLET = 0.9;
const LINE = meters(PROP_SIZES.highwayLine);
const DASH = meters(PROP_SIZES.highwayDash);
const DASH_PERIOD = DASH + meters(PROP_SIZES.highwayDashGap);
const DASH_COUNT = Math.ceil((2 * HIGHWAY_HALF_LENGTH) / DASH_PERIOD);
const UP = new Vector3(0, 1, 0);

const SIDES: ReadonlyArray<readonly [number, number, number]> = [
  [0, -1, N],
  [1, 0, E],
  [0, 1, S],
  [-1, 0, W],
];

const isRoad = (tiles: readonly Tile[], x: number, y: number): boolean =>
  inBounds(x, y) && !!tiles[tileIndex(x, y)]?.road;

/** Which sides of a road tile connect: road neighbours, and the access road leaving the map. */
const roadMask = (tiles: readonly Tile[], x: number, y: number): number => {
  let mask = 0;
  for (const [dx, dy, bit] of SIDES) {
    const outward = !inBounds(x + dx, y + dy) && dx === 0 && dy === OFFMAP_ROAD_DIR;
    if (outward || isRoad(tiles, x + dx, y + dy)) mask |= bit;
  }
  return mask;
};

type Layout = Record<PieceKind, Matrix4[]>;

/** One matrix per road tile, grouped by the piece it draws. */
const layoutRoads = (tiles: readonly Tile[]): { matrices: Layout; shades: Record<PieceKind, number[]> } => {
  const matrices = Object.fromEntries(PIECE_KINDS.map((k) => [k, [] as Matrix4[]])) as Layout;
  const shades = Object.fromEntries(PIECE_KINDS.map((k) => [k, [] as number[]])) as Record<PieceKind, number[]>;
  const q = new Quaternion();
  const one = new Vector3(1, 1, 1);
  tiles.forEach((tile, i) => {
    if (!tile.road) return;
    const { x, y } = tileCoords(i);
    const [cx, cz] = tileToWorld(x, y);
    const { kind, turns } = pieceFor(roadMask(tiles, x, y));
    // Land for sale sits a little lower.
    const base = (tile.state === 'locked' ? -0.02 : 0) - SINK;
    q.setFromAxisAngle(UP, (-Math.PI / 2) * turns);
    matrices[kind].push(new Matrix4().compose(new Vector3(cx, base, cz), q, one));
    shades[kind].push(0.95 + hash01(i * 7) * 0.08);
  });
  return { matrices, shades };
};

/** One instanced mesh of a road piece. */
function PieceMesh({ kind, matrices, shades }: { kind: PieceKind; matrices: Matrix4[]; shades: number[] }) {
  const meshRef = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => pieceGeometry(kind, STYLE), [kind]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const color = new Color();
    matrices.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, color.setScalar(shades[i] ?? 1));
    });
    mesh.count = matrices.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices, shades]);

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, TILE_COUNT]} receiveShadow raycast={noRaycast}>
      <meshStandardMaterial vertexColors roughness={1} />
    </instancedMesh>
  );
}

/**
 * Dirt roads drawn as pieces that follow their neighbours (straights, bends, T junctions,
 * crossings and dead ends), the access road beyond the map and the highway.
 */
export function RoadLayer() {
  const tiles = useGameStore((s) => s.game.tiles);
  const { matrices, shades } = useMemo(() => layoutRoads(tiles), [tiles]);
  return (
    <group>
      {PIECE_KINDS.map((kind) => (
        <PieceMesh key={kind} kind={kind} matrices={matrices[kind]} shades={shades[kind]} />
      ))}
      <OffMapRoad />
      <Highway />
    </group>
  );
}

/** The access road between the map border and the highway, widening into it with rounded corners. */
function OffMapRoad() {
  // From the map border to the highway's near edge (a hair into the asphalt).
  const length = OFFMAP_ROAD_LENGTH - HIGHWAY_HALF_WIDTH + 0.05;
  const geometry = useMemo(() => {
    const { half, verge, surfaceHeight, vergeHeight } = STYLE;
    // Drawn heading south from v = 0 (the border) to v = length (the highway edge); flipped when the road heads north.
    const strip = (h: number): Array<readonly [number, number]> => [[-h, 0], [h, 0], [h, length], [-h, length]];
    const fillets = (h: number, r: number) =>
      junctionFillets(h, r).map((points) => points.map(([u, v]) => [u, v + length] as const));
    const parts = [
      slab(strip(half + verge), vergeHeight, PALETTE.roadVerge),
      ...fillets(half + verge, JUNCTION_FILLET + verge).map((p) => slab(p, vergeHeight, PALETTE.roadVerge)),
      slab(strip(half), surfaceHeight, PALETTE.road),
      ...fillets(half, JUNCTION_FILLET).map((p) => slab(p, surfaceHeight, PALETTE.road)),
      ...straightRuts(length, STYLE.rutOffset, STYLE.rutWidth).map((p) => slab(p, surfaceHeight + 0.003, PALETTE.roadRut)),
    ];
    const merged = merge(parts);
    if (OFFMAP_ROAD_DIR < 0) merged.rotateY(Math.PI);
    return merged;
  }, [length]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      position={[OFFMAP_ROAD_X, CORRIDOR_Y - SINK, OFFMAP_ROAD_Z]}
      receiveShadow
      raycast={noRaycast}
    >
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  );
}

/** The paved two-lane highway the access road meets, running along X beyond the farm edge. */
function Highway() {
  const dashRef = useRef<InstancedMesh>(null);
  const top = CORRIDOR_Y + STYLE.surfaceHeight;
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
      <mesh position={[OFFMAP_ROAD_X, top - STYLE.surfaceHeight / 2, HIGHWAY_Z]} receiveShadow raycast={noRaycast}>
        <boxGeometry args={[length, STYLE.surfaceHeight, HIGHWAY_HALF_WIDTH * 2]} />
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
