import { ExtrudeGeometry, Shape, Vector2, type BufferGeometry } from 'three';
import { merge, part } from './models/geometry';
import { PALETTE } from './palette';

/**
 * Road tiles as low-poly pieces: a dead end, a straight, a bend (a quarter ring), a T and a cross,
 * each in one orientation (arms named by tile side), plus a lone patch. A tile draws the piece
 * whose arms match its road neighbours, turned in quarter turns. Pieces are flat outlines in tile
 * space (u east, v south, the tile spans -0.5..0.5) extruded a little, with a worn verge under the
 * dirt.
 */

export type PieceKind = 'dot' | 'end' | 'straight' | 'curve' | 'tee' | 'cross';
export const PIECE_KINDS: readonly PieceKind[] = ['dot', 'end', 'straight', 'curve', 'tee', 'cross'];

/** Side bits of a road tile's connections. */
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

/** Arms of each piece as drawn (before turning). */
const CANONICAL: Record<PieceKind, number> = {
  dot: 0,
  end: N,
  straight: N | S,
  curve: N | E,
  tee: N | E | S,
  cross: N | E | S | W,
};

/** The arms after one clockwise quarter turn (N → E → S → W → N). */
const turnMask = (mask: number): number => ((mask << 1) | (mask >> 3)) & 15;

const bitCount = (mask: number): number => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);

/** The piece for a tile's arms and how many clockwise quarter turns it needs. */
export const pieceFor = (mask: number): { kind: PieceKind; turns: number } => {
  const arms = bitCount(mask);
  const kind: PieceKind =
    arms === 0 ? 'dot' : arms === 1 ? 'end' : arms === 3 ? 'tee' : arms === 4 ? 'cross' : mask === (N | S) || mask === (E | W) ? 'straight' : 'curve';
  let shape = CANONICAL[kind];
  for (let turns = 0; turns < 4; turns++) {
    if (shape === mask) return { kind, turns };
    shape = turnMask(shape);
  }
  return { kind, turns: 0 };
};

type Point = readonly [number, number];

/** Points along a circle arc from angle `from` to `to` (radians, v pointing south), ends included. */
const arc = (cx: number, cy: number, r: number, from: number, to: number, steps: number): Point[] => {
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return points;
};

const QUARTER = Math.PI / 2;
const BEND_STEPS = 12;
const FILLET_STEPS = 5;

/**
 * Outline of a piece whose dirt is `half` tiles wide on each side of the center line. Inner
 * corners of junctions are rounded as far as the tile allows.
 */
const outline = (kind: PieceKind, half: number): Point[] => {
  const h = half;
  const r = Math.max(0.001, (0.5 - h) * 0.9);
  const ne = arc(h + r, -h - r, r, Math.PI, QUARTER, FILLET_STEPS);
  const se = arc(h + r, h + r, r, 3 * QUARTER, Math.PI, FILLET_STEPS);
  const sw = arc(-h - r, h + r, r, 0, -QUARTER, FILLET_STEPS);
  const nw = arc(-h - r, -h - r, r, QUARTER, 0, FILLET_STEPS);
  switch (kind) {
    case 'dot':
      return arc(0, 0, h, 0, Math.PI * 2, 24).slice(0, -1);
    case 'end':
      return [[-h, -0.5], [h, -0.5], ...arc(0, 0, h, 0, Math.PI, BEND_STEPS)];
    case 'straight':
      return [[-h, -0.5], [h, -0.5], [h, 0.5], [-h, 0.5]];
    case 'curve':
      // A quarter ring around the tile's north-east corner, from the north side to the east side.
      return [...arc(0.5, -0.5, 0.5 + h, Math.PI, QUARTER, BEND_STEPS), ...arc(0.5, -0.5, 0.5 - h, QUARTER, Math.PI, BEND_STEPS)];
    case 'tee':
      return [[-h, -0.5], [h, -0.5], ...ne, [0.5, -h], [0.5, h], ...se, [h, 0.5], [-h, 0.5]];
    case 'cross':
      return [
        [-h, -0.5],
        [h, -0.5],
        ...ne,
        [0.5, -h],
        [0.5, h],
        ...se,
        [h, 0.5],
        [-h, 0.5],
        ...sw,
        [-0.5, h],
        [-0.5, -h],
        ...nw,
      ];
  }
};

/** Drops repeated consecutive points (they break the triangulation). */
const distinct = (points: readonly Point[]): Point[] =>
  points.filter((p, i) => {
    const q = points[(i + points.length - 1) % points.length];
    return !q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6;
  });

/** A flat outline (u east, v south) extruded `height` up from y = 0, painted one color. */
export const slab = (points: readonly Point[], height: number, color: string): BufferGeometry => {
  // The shape lives in (x, y) and is extruded along +z; turning it flat maps y to -z, so v is negated.
  const shape = new Shape(distinct(points).map(([u, v]) => new Vector2(u, -v)));
  const geometry = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
  geometry.rotateX(-Math.PI / 2);
  return part(geometry, color);
};

export interface PieceStyle {
  /** Half the dirt width, in tiles. */
  half: number;
  /** How far the verge reaches past the dirt on each side, in tiles. */
  verge: number;
  surfaceHeight: number;
  vergeHeight: number;
  /** Wheel ruts: distance of each from the center line, and their width (tiles). */
  rutOffset: number;
  rutWidth: number;
}

/** A band of `width` around a straight line from (u0, v0) to (u1, v1) (axis-aligned). */
const band = (u0: number, v0: number, u1: number, v1: number, width: number): Point[] => {
  const w = width / 2;
  if (u0 === u1) return [[u0 - w, Math.min(v0, v1)], [u0 + w, Math.min(v0, v1)], [u0 + w, Math.max(v0, v1)], [u0 - w, Math.max(v0, v1)]];
  return [[Math.min(u0, u1), v0 - w], [Math.max(u0, u1), v0 - w], [Math.max(u0, u1), v0 + w], [Math.min(u0, u1), v0 + w]];
};

/**
 * The two wheel ruts a piece shows, following its arms: along a straight, around a bend, down a
 * dead end, through a T (the through road plus the branch) and both ways across a crossing.
 */
const ruts = (kind: PieceKind, offset: number, width: number): Point[][] => {
  const sides = [-offset, offset];
  const northSouth = sides.map((o) => band(o, -0.5, o, 0.5, width));
  const eastWest = sides.map((o) => band(-0.5, o, 0.5, o, width));
  switch (kind) {
    case 'dot':
      return [];
    case 'end':
      return sides.map((o) => band(o, -0.5, o, 0, width));
    case 'straight':
      return northSouth;
    case 'curve':
      return sides.map((o) => {
        const r = 0.5 + o;
        return [
          ...arc(0.5, -0.5, r + width / 2, Math.PI, QUARTER, BEND_STEPS),
          ...arc(0.5, -0.5, r - width / 2, QUARTER, Math.PI, BEND_STEPS),
        ];
      });
    case 'tee':
      return [...northSouth, ...sides.map((o) => band(offset, o, 0.5, o, width))];
    case 'cross':
      return [...northSouth, ...eastWest];
  }
};

/** The two ruts of a straight road running south from v = 0 to v = length. */
export const straightRuts = (length: number, offset: number, width: number): Point[][] =>
  [-offset, offset].map((o) => band(o, 0, o, length, width));

/** A piece's geometry: the dirt over a slightly wider and lower verge, with darker wheel ruts on top. */
export const pieceGeometry = (kind: PieceKind, style: PieceStyle): BufferGeometry =>
  merge([
    slab(outline(kind, style.half + style.verge), style.vergeHeight, PALETTE.roadVerge),
    slab(outline(kind, style.half), style.surfaceHeight, PALETTE.road),
    ...ruts(kind, style.rutOffset, style.rutWidth).map((points) => slab(points, style.surfaceHeight + 0.003, PALETTE.roadRut)),
  ]);

/**
 * The rounded widening where a road meets a crossing road's edge: a corner piece on each side,
 * bounded by the road's side, the edge (v = 0, the crossing road on v > 0) and a concave arc.
 */
export const junctionFillets = (half: number, radius: number): Point[][] => [
  [[half, 0], [half + radius, 0], ...arc(half + radius, -radius, radius, QUARTER, Math.PI, FILLET_STEPS * 2).slice(1)],
  [[-half, 0], ...arc(-half - radius, -radius, radius, 0, QUARTER, FILLET_STEPS * 2).slice(0, -1), [-half - radius, 0]],
];
