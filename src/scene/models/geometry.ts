import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Euler,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Tiny toolkit for building multi-colored low-poly models as a single merged geometry
 * with vertex colors, so each model can be drawn by one InstancedMesh.
 */

export interface PartTransform {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

const paint = (geometry: BufferGeometry, color: string): BufferGeometry => {
  const c = new Color(color);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
};

const place = (geometry: BufferGeometry, t: PartTransform): BufferGeometry => {
  const m = new Matrix4().compose(
    new Vector3(...(t.position ?? [0, 0, 0])),
    new Quaternion().setFromEuler(new Euler(...(t.rotation ?? [0, 0, 0]))),
    new Vector3(...(t.scale ?? [1, 1, 1])),
  );
  return geometry.applyMatrix4(m);
};

export const part = (geometry: BufferGeometry, color: string, t: PartTransform = {}): BufferGeometry =>
  paint(place(geometry, t), color);

export const box = (w: number, h: number, d: number, color: string, t: PartTransform = {}) =>
  part(new BoxGeometry(w, h, d), color, t);

export const cone = (r: number, h: number, segments: number, color: string, t: PartTransform = {}) =>
  part(new ConeGeometry(r, h, segments), color, t);

export const cylinder = (
  rTop: number,
  rBottom: number,
  h: number,
  segments: number,
  color: string,
  t: PartTransform = {},
) => part(new CylinderGeometry(rTop, rBottom, h, segments), color, t);

export const sphere = (r: number, color: string, t: PartTransform = {}, w = 6, h = 4) =>
  part(new SphereGeometry(r, w, h), color, t);

export const merge = (parts: BufferGeometry[]): BufferGeometry => {
  // Mixed indexed (box, cone…) and non-indexed (icosahedron) parts can't merge: flatten all.
  const mixed = parts.some((p) => p.index) && parts.some((p) => !p.index);
  const flat = mixed ? parts.map((p) => (p.index ? p.toNonIndexed() : p)) : parts;
  const merged = mergeGeometries(flat, false);
  for (const p of parts) p.dispose();
  for (const p of flat) p.dispose();
  if (!merged) throw new Error('Failed to merge model geometry');
  merged.computeBoundingSphere();
  return merged;
};
