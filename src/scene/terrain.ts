import { BufferGeometry, Color, Float32BufferAttribute, PlaneGeometry } from 'three';
import { PROP_SIZES, meters } from '../data/scale';
import { GRID_SIZE } from '../data/world';
import { accessRoadExit } from '../game/roads';
import { fbm, valueNoise } from './noise';
import { PALETTE } from './palette';

const HALF = GRID_SIZE / 2;
/** Terrain height just outside the farm grid: level with land for sale. */
const EDGE_HEIGHT = -0.02;
/** Hidden height below the tiles inside the grid. */
const UNDER_GRID = -0.3;

/** Distance (Chebyshev) from the farm grid's square border; 0 inside. */
export const distanceFromGrid = (x: number, z: number): number =>
  Math.max(0, Math.max(Math.abs(x), Math.abs(z)) - HALF);

const smoothstep = (a: number, b: number, t: number): number => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

const EXIT = accessRoadExit();
/** World X of the off-map road's center line. */
export const OFFMAP_ROAD_X = EXIT.border.x - HALF;
/** World Z where the road crosses the map border, and the direction it heads (-1 north, +1 south). */
export const OFFMAP_ROAD_Z = EXIT.border.y - HALF;
export const OFFMAP_ROAD_DIR = EXIT.outward;
/** World Z of the highway's center line (it runs along X, parallel to the map edge). */
export const HIGHWAY_Z = EXIT.junction.y - HALF;
/** Half of the paved width, in world units. */
export const HIGHWAY_HALF_WIDTH = meters(PROP_SIZES.highwayWidth) / 2;
/** How much wider the highway is than the dirt road on each side. */
const HIGHWAY_EXTRA = HIGHWAY_HALF_WIDTH - meters(PROP_SIZES.roadWidth) / 2;

/** Distance from the off-map access road between the map border and the highway (Infinity elsewhere). */
const distanceFromAccess = (x: number, z: number): number => {
  const along = (z - OFFMAP_ROAD_Z) * OFFMAP_ROAD_DIR;
  const beyond = (z - HIGHWAY_Z) * OFFMAP_ROAD_DIR;
  return along < -1 || beyond > 0 ? Infinity : Math.abs(x - OFFMAP_ROAD_X);
};

/**
 * Distance from the roads outside the farm: the access road and the highway, measured so both
 * have the same clearance from their edges (the highway is wider than the dirt road).
 */
export const distanceFromRoad = (x: number, z: number): number =>
  Math.min(distanceFromAccess(x, z), Math.max(0, Math.abs(z - HIGHWAY_Z) - HIGHWAY_EXTRA));

/** Ground height outside the farm: flat near the fence and along the road, rolling hills further away. */
export const terrainHeight = (x: number, z: number): number => {
  const d = distanceFromGrid(x, z);
  if (d <= 0) return EDGE_HEIGHT;
  const hills = (fbm(x * 0.018 + 100, z * 0.018 - 50, 4, 3) - 0.35) * 16;
  const bumps = (valueNoise(x * 0.25, z * 0.25, 9) - 0.5) * 0.35;
  const natural = Math.max(0, hills) * smoothstep(6, 45, d) + bumps * smoothstep(1, 6, d);
  // The road corridor is graded flat, blending back into the hills on both sides.
  return EDGE_HEIGHT + natural * smoothstep(2, 9, distanceFromRoad(x, z));
};

const SIZE = 320;
/** Vertex spacing: divides HALF so a row of vertices lies exactly on the grid border. */
const SPACING = 2;

/** Faceted low-poly terrain around the farm with per-face colors. */
export const buildTerrain = (): BufferGeometry => {
  const segments = SIZE / SPACING;
  const plane = new PlaneGeometry(SIZE, SIZE, segments, segments);
  plane.rotateX(-Math.PI / 2);
  const pos = plane.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const inside = Math.abs(x) < HALF - 0.01 && Math.abs(z) < HALF - 0.01;
    pos.setY(i, inside ? UNDER_GRID : terrainHeight(x, z));
  }
  const geometry = plane.toNonIndexed();
  plane.dispose();

  const p = geometry.getAttribute('position');
  const colors = new Float32Array(p.count * 3);
  const dark = new Color(PALETTE.groundDark);
  const mid = new Color(PALETTE.ground);
  const light = new Color(PALETTE.groundLight);
  const dry = new Color(PALETTE.grassDry);
  const c = new Color();
  for (let tri = 0; tri < p.count; tri += 3) {
    const cx = (p.getX(tri) + p.getX(tri + 1) + p.getX(tri + 2)) / 3;
    const cy = (p.getY(tri) + p.getY(tri + 1) + p.getY(tri + 2)) / 3;
    const cz = (p.getZ(tri) + p.getZ(tri + 1) + p.getZ(tri + 2)) / 3;
    const n = fbm(cx * 0.05, cz * 0.05, 3, 21);
    c.copy(dark).lerp(mid, smoothstep(0.25, 0.55, n)).lerp(light, smoothstep(0.55, 0.8, n));
    c.lerp(dry, Math.max(0, fbm(cx * 0.03 + 7, cz * 0.03, 2, 5) - 0.6) * 1.5);
    // Hilltops catch a little more light.
    c.multiplyScalar(0.95 + Math.min(cy, 10) * 0.012 + valueNoise(cx, cz, 4) * 0.06);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (tri + k) * 3);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
};
