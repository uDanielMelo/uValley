import { useEffect, useMemo } from 'react';
import { Matrix4, MeshStandardMaterial, Quaternion, Vector3, type BufferGeometry } from 'three';
import { hash01 } from './coords';
import { InstancedProps } from './InstancedProps';
import { bush, flowerTuft, grassTuft, pineTree, rock, roundTree } from './models/natureModels';
import { fbm } from './noise';
import { PALETTE } from './palette';
import { buildTerrain, distanceFromGrid, distanceFromRoad, terrainHeight } from './terrain';

/** Props keep this far (world units) from the off-map road's center line. */
const ROAD_CLEARANCE = 1.6;

const noRaycast = () => null;
const UP = new Vector3(0, 1, 0);

interface ScatterOptions {
  candidates: number;
  seed: number;
  /** Allowed distance band from the farm grid border. */
  minDistance: number;
  maxDistance: number;
  /** Acceptance probability for a candidate at (x, z). */
  density: (x: number, z: number) => number;
  scale: [number, number];
}

/** Deterministic scatter around the farm, returning one matrix per accepted point. */
const scatter = (o: ScatterOptions): Matrix4[] => {
  const result: Matrix4[] = [];
  const q = new Quaternion();
  const reach = 16 + o.maxDistance;
  for (let i = 0; i < o.candidates; i++) {
    const x = (hash01(o.seed + i * 3) * 2 - 1) * reach;
    const z = (hash01(o.seed + i * 7 + 1) * 2 - 1) * reach;
    const d = distanceFromGrid(x, z);
    if (d < o.minDistance || d > o.maxDistance) continue;
    if (distanceFromRoad(x, z) < ROAD_CLEARANCE * (o.scale[1] > 1 ? 2 : 1)) continue;
    if (hash01(o.seed + i * 11 + 2) > o.density(x, z)) continue;
    const s = o.scale[0] + hash01(o.seed + i * 13 + 3) * (o.scale[1] - o.scale[0]);
    q.setFromAxisAngle(UP, hash01(o.seed + i * 17 + 4) * Math.PI * 2);
    result.push(new Matrix4().compose(new Vector3(x, terrainHeight(x, z), z), q, new Vector3(s, s, s)));
  }
  return result;
};

/** Forest mask: clusters of trees with clearings. */
const forest = (x: number, z: number) => Math.min(1, Math.max(0, (fbm(x * 0.04, z * 0.04, 3, 2) - 0.38) * 3));
const pineMask = (x: number, z: number) => fbm(x * 0.03 + 50, z * 0.03, 2, 8) > 0.5;

interface PropSet {
  key: string;
  geometry: BufferGeometry;
  matrices: Matrix4[];
  castShadow?: boolean;
  wind?: number;
}

const buildProps = (): PropSet[] => {
  const trees = scatter({
    candidates: 5000,
    seed: 1,
    minDistance: 2.5,
    maxDistance: 75,
    density: (x, z) => forest(x, z) * 0.6,
    scale: [0.85, 1.6],
  });
  const pines: Matrix4[] = [];
  const roundA: Matrix4[] = [];
  const roundB: Matrix4[] = [];
  const p = new Vector3();
  trees.forEach((m, i) => {
    p.setFromMatrixPosition(m);
    if (pineMask(p.x, p.z)) pines.push(m);
    else (i % 2 ? roundA : roundB).push(m);
  });
  const tufts = (seed: number, density: number) =>
    scatter({
      candidates: 4000,
      seed,
      minDistance: 0.2,
      maxDistance: 26,
      density: (x, z) => density * (1 - Math.min(1, distanceFromGrid(x, z) / 30)),
      scale: [1.1, 1.9],
    });

  return [
    { key: 'roundA', geometry: roundTree(0), matrices: roundA, castShadow: true, wind: 0.03 },
    { key: 'roundB', geometry: roundTree(1), matrices: roundB, castShadow: true, wind: 0.03 },
    { key: 'pine', geometry: pineTree(), matrices: pines, castShadow: true, wind: 0.02 },
    {
      key: 'bush',
      geometry: bush(),
      castShadow: true,
      matrices: scatter({
        candidates: 1200,
        seed: 300,
        minDistance: 0.8,
        maxDistance: 45,
        density: (x, z) => 0.15 + forest(x, z) * 0.5,
        scale: [0.7, 1.4],
      }),
    },
    {
      key: 'rock',
      geometry: rock(),
      castShadow: true,
      matrices: scatter({
        candidates: 700,
        seed: 500,
        minDistance: 3,
        maxDistance: 60,
        density: () => 0.2,
        scale: [0.6, 1.8],
      }),
    },
    { key: 'grass', geometry: grassTuft(11), matrices: tufts(700, 0.9), wind: 0.35 },
    { key: 'flowerW', geometry: flowerTuft(PALETTE.flowerWhite, 31), matrices: tufts(800, 0.18), wind: 0.35 },
    { key: 'flowerY', geometry: flowerTuft(PALETTE.flowerYellow, 47), matrices: tufts(900, 0.12), wind: 0.35 },
    { key: 'flowerP', geometry: flowerTuft(PALETTE.flowerPurple, 59), matrices: tufts(1000, 0.08), wind: 0.35 },
  ];
};

/** Rolling terrain, forests, bushes, rocks and wild grass around the farm (static). */
export function Environment() {
  const terrain = useMemo(buildTerrain, []);
  const terrainMaterial = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }),
    [],
  );
  const props = useMemo(buildProps, []);
  useEffect(
    () => () => {
      terrain.dispose();
      terrainMaterial.dispose();
      for (const set of props) set.geometry.dispose();
    },
    [terrain, terrainMaterial, props],
  );

  return (
    <group>
      <mesh geometry={terrain} material={terrainMaterial} receiveShadow raycast={noRaycast} />
      {props.map((set) => (
        <InstancedProps
          key={set.key}
          geometry={set.geometry}
          matrices={set.matrices}
          castShadow={set.castShadow}
          wind={set.wind}
        />
      ))}
    </group>
  );
}
