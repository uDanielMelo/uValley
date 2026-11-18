import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Mesh } from 'three';
import { meters } from '../data/scale';
import type { StructureId } from '../data/structures';
import { workProgress } from '../game/construction';
import { footprintOf } from '../game/structures';
import type { StructureWorkKind } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { cornerToWorld } from './coords';
import { PALETTE } from './palette';
import { STRUCTURE_MODELS, StructureTransform, type PlacedProps } from './structureModels';
import { TranslucentModel } from './TranslucentModel';

const noRaycast = () => null;

/** Scaffold height per structure, in meters (roughly the walls; the silo's goes halfway). */
const SCAFFOLD_HEIGHT: Partial<Record<StructureId, number>> = {
  bunkhouse: 3.4,
  chickenCoop: 2.4,
  pigsty: 2.0,
  sheepfold: 2.6,
  corral: 3.4,
  stable: 3.4,
  silo: 6.5,
  warehouse: 5,
  barn: 6,
};
const DEFAULT_SCAFFOLD = 3;
const POLE = meters(0.12);
const PLANK = meters(0.08);
/** Scaffold sits just outside the footprint edge. */
const INSET = 0.06;

const progressOf = (id: number): number => {
  const s = useGameStore.getState().game.structures.find((x) => x.id === id);
  return (s && workProgress(s)) ?? 0;
};

interface Bar {
  x: number;
  z: number;
  length: number;
  along: 'x' | 'z';
}

/** Wooden poles at the corners and along long sides, with planks at two levels. */
function Scaffold({ width, depth, height }: { width: number; depth: number; height: number }) {
  const { poles, planks } = useMemo(() => {
    const hw = width / 2 + INSET;
    const hd = depth / 2 + INSET;
    const xs = width > 2 ? [-hw, 0, hw] : [-hw, hw];
    const zs = depth > 2 ? [-hd, 0, hd] : [-hd, hd];
    const posts: [number, number][] = [];
    for (const x of xs) for (const z of zs) if (Math.abs(x) === hw || Math.abs(z) === hd) posts.push([x, z]);
    const bars: Bar[] = [
      { x: 0, z: -hd, length: hw * 2, along: 'x' },
      { x: 0, z: hd, length: hw * 2, along: 'x' },
      { x: -hw, z: 0, length: hd * 2, along: 'z' },
      { x: hw, z: 0, length: hd * 2, along: 'z' },
    ];
    return { poles: posts, planks: bars };
  }, [width, depth]);
  return (
    <group>
      {poles.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, height / 2, z]} castShadow raycast={noRaycast}>
          <boxGeometry args={[POLE, height, POLE]} />
          <meshStandardMaterial color={PALETTE.scaffold} flatShading roughness={0.9} />
        </mesh>
      ))}
      {[0.4, 0.8].flatMap((level) =>
        planks.map((p) => (
          <mesh key={`${level}-${p.x},${p.z}`} position={[p.x, height * level, p.z]} castShadow raycast={noRaycast}>
            <boxGeometry args={p.along === 'x' ? [p.length, PLANK, PLANK * 3] : [PLANK * 3, PLANK, p.length]} />
            <meshStandardMaterial color={PALETTE.scaffold} flatShading roughness={0.9} />
          </mesh>
        )),
      )}
    </group>
  );
}

/** A small stack of boards on a corner of the site. */
function Lumber({ width, depth }: { width: number; depth: number }) {
  const board = meters(0.15);
  return (
    <group position={[width / 2 - 0.35, 0, depth / 2 - 0.25]} rotation={[0, 0.3, 0]}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, board * (i + 0.5), i % 2 === 0 ? 0 : 0.03]} castShadow raycast={noRaycast}>
          <boxGeometry args={[meters(2.4), board, meters(0.5)]} />
          <meshStandardMaterial color={PALETTE.lumber} flatShading roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

const BAR_WIDTH = 1.1;
const BAR_HEIGHT = 0.12;

/** Progress bar floating over the site, always facing the camera. */
function ProgressBar({ id, height, kind }: { id: number; height: number; kind: StructureWorkKind }) {
  const fill = useRef<Mesh>(null);
  useFrame(() => {
    const mesh = fill.current;
    if (!mesh) return;
    const p = Math.max(0.001, progressOf(id));
    mesh.scale.x = p;
    mesh.position.x = (-BAR_WIDTH / 2) * (1 - p);
  });
  return (
    <Billboard position={[0, height + 0.35, 0]}>
      <mesh raycast={noRaycast} renderOrder={3}>
        <planeGeometry args={[BAR_WIDTH + 0.06, BAR_HEIGHT + 0.06]} />
        <meshBasicMaterial color={PALETTE.progressBack} toneMapped={false} depthTest={false} transparent />
      </mesh>
      <mesh ref={fill} position={[0, 0, 0.001]} raycast={noRaycast} renderOrder={4}>
        <planeGeometry args={[BAR_WIDTH, BAR_HEIGHT]} />
        <meshBasicMaterial
          color={kind === 'build' ? PALETTE.progressBuild : PALETTE.progressDemolish}
          toneMapped={false}
          depthTest={false}
          transparent
        />
      </mesh>
    </Billboard>
  );
}

/**
 * A structure with work under way. A site shows bare ground, scaffolding, boards and the building
 * as a see-through shape that firms up as the work goes on; a demolition shows the real building
 * inside scaffolding. Both get a progress bar.
 */
export function ConstructionSite({ id, type, x, y, rotation, kind }: PlacedProps & { id: number; kind: StructureWorkKind }) {
  const fp = footprintOf(type, x, y, rotation);
  const [x0, z0] = cornerToWorld(fp.x, fp.y);
  const height = meters(SCAFFOLD_HEIGHT[type] ?? DEFAULT_SCAFFOLD);
  const Model = STRUCTURE_MODELS[type];
  return (
    <group>
      <group position={[x0 + fp.width / 2, 0, z0 + fp.depth / 2]}>
        {kind === 'build' && (
          <>
            <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={noRaycast}>
              <planeGeometry args={[fp.width - 0.04, fp.depth - 0.04]} />
              <meshStandardMaterial color={PALETTE.siteGround} roughness={1} />
            </mesh>
            <Lumber width={fp.width} depth={fp.depth} />
          </>
        )}
        <Scaffold width={fp.width} depth={fp.depth} height={height} />
        <ProgressBar id={id} height={height} kind={kind} />
      </group>
      {kind === 'build' ? (
        <TranslucentModel type={type} x={x} y={y} rotation={rotation} opacity={() => 0.15 + progressOf(id) * 0.6} />
      ) : (
        <StructureTransform type={type} x={x} y={y} rotation={rotation}>
          <Model />
        </StructureTransform>
      )}
    </group>
  );
}
