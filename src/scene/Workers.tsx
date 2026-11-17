import { useFrame } from '@react-three/fiber';
import { createRef, useMemo, useRef } from 'react';
import { MathUtils, type Group } from 'three';
import { PERSON_HEIGHT } from '../data/scale';
import { FAMILY } from '../data/workers';
import { GRID_SIZE } from '../data/world';
import type { ToolId, Worker } from '../game/types';
import { workerActivity } from '../game/workers';
import { useGameStore } from '../store/gameStore';
import { hash01 } from './coords';
import { Person, personScale, type PersonLook, type PersonRig } from './models/Person';

const HALF = GRID_SIZE / 2;
const TOOL_IDS: readonly ToolId[] = ['hoe', 'seed', 'water', 'hand'];
const STRAW = '#e2c27a';

/** Looks for the family, in FAMILY order. */
const DEFAULT_LOOK: PersonLook = { shirt: '#3f6fb5', pants: '#4a5a7a', skin: '#e0ac85', hat: STRAW, hair: '#4a3324' };
const FAMILY_LOOKS: readonly PersonLook[] = [
  DEFAULT_LOOK,
  { shirt: '#c8553d', pants: '#5a4a6a', skin: '#f0c8a0', hat: STRAW, hair: '#7a4a2a' },
  { shirt: '#e3b23c', pants: '#3c5a8a', skin: '#d9a27a', hat: null, hair: '#3a2a1a' },
];
const SHIRTS = ['#6a9a4a', '#b85c8a', '#5a8ab0', '#d07a3a', '#8a6ab0', '#c0a040', '#4aa090', '#a04a4a'];
const PANTS = ['#4a5a7a', '#5e4630', '#3c5a8a', '#6a6a5a'];
const SKINS = ['#f0c8a0', '#e0ac85', '#c68a5e', '#8d5a3b', '#f3d2b5'];
const HAIR = ['#2b2118', '#4a3324', '#7a4a2a', '#c8a060', '#1a1a1a'];

const pick = <T,>(list: readonly T[], r: number): T => list[Math.floor(r * list.length) % list.length] as T;

const lookFor = (worker: Worker): PersonLook => {
  if (worker.kind === 'family') {
    const index = FAMILY.findIndex((f) => f.name === worker.name);
    const look = FAMILY_LOOKS[index];
    if (look) return look;
  }
  const r = (k: number) => hash01(worker.id * 97 + k);
  return {
    shirt: pick(SHIRTS, r(1)),
    pants: pick(PANTS, r(2)),
    skin: pick(SKINS, r(3)),
    hair: pick(HAIR, r(4)),
    hat: r(5) < 0.6 ? STRAW : null,
  };
};

/** Height in meters: the family's own, a random one around the adult default for hired hands. */
const heightFor = (worker: Worker): number => {
  const template = worker.kind === 'family' ? FAMILY.find((f) => f.name === worker.name) : undefined;
  if (template?.height) return template.height;
  return PERSON_HEIGHT.adult + (hash01(worker.id * 53 + 7) * 2 - 1) * PERSON_HEIGHT.variation;
};

/** Shortest signed angle from a to b. */
const angleDelta = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));

interface Pose {
  legL: number;
  legR: number;
  armL: number;
  armR: number;
  bend: number;
  bob: number;
}

const workPose = (kind: ToolId, t: number): Pose => {
  switch (kind) {
    case 'hoe': {
      const swing = Math.sin(t * 6.5) * 0.5 + 0.5;
      const arm = -0.4 - swing * 1.8;
      return { legL: -0.15, legR: 0.15, armL: arm, armR: arm, bend: 0.15 + (1 - swing) * 0.35, bob: 0 };
    }
    case 'seed':
      return { legL: -0.5, legR: 0.3, armL: -0.3, armR: -0.9 + Math.sin(t * 5) * 0.45, bend: 0.75, bob: -0.05 };
    case 'water':
      return { legL: -0.1, legR: 0.1, armL: 0, armR: -1.0 + Math.sin(t * 2) * 0.12, bend: 0.12, bob: 0 };
    case 'hand':
      return {
        legL: -0.4,
        legR: 0.25,
        armL: -1.1 + Math.sin(t * 4) * 0.35,
        armR: -1.1 + Math.sin(t * 4 + 1.6) * 0.35,
        bend: 0.85 + Math.sin(t * 4) * 0.08,
        bob: -0.05,
      };
  }
};

function WorkerFigure({ id }: { id: number }) {
  const { look, height } = useMemo(() => {
    const worker = useGameStore.getState().game.workers.find((w) => w.id === id);
    return worker
      ? { look: lookFor(worker), height: heightFor(worker) }
      : { look: DEFAULT_LOOK, height: PERSON_HEIGHT.adult };
  }, [id]);
  /** Model-to-world scale: strides and bobbing shrink with the person. */
  const fit = personScale(height);
  const rig = useMemo<PersonRig>(
    () => ({
      root: createRef<Group>(),
      upper: createRef<Group>(),
      legL: createRef<Group>(),
      legR: createRef<Group>(),
      armL: createRef<Group>(),
      armR: createRef<Group>(),
      tools: { hoe: createRef<Group>(), seed: createRef<Group>(), water: createRef<Group>(), hand: createRef<Group>() },
    }),
    [],
  );
  const anim = useRef({ x: NaN, z: NaN, heading: 0, phase: 0, time: hash01(id) * 10 });

  useFrame((_, delta) => {
    const { game, settings } = useGameStore.getState();
    const worker = game.workers.find((w) => w.id === id);
    const root = rig.root.current;
    const upper = rig.upper.current;
    const legL = rig.legL.current;
    const legR = rig.legR.current;
    const armL = rig.armL.current;
    const armR = rig.armR.current;
    if (!worker || !root || !upper || !legL || !legR || !armL || !armR) return;

    const a = anim.current;
    const activity = workerActivity(game, worker);
    root.visible = activity !== 'resting';
    const dt = Math.min(delta, 0.1);
    a.time += dt * settings.speed;

    const x = worker.x - HALF;
    const z = worker.y - HALF;
    if (Number.isNaN(a.x)) {
      a.x = x;
      a.z = z;
    }
    const dx = x - a.x;
    const dz = z - a.z;
    const moved = Math.hypot(dx, dz);
    if (moved > 1e-4) {
      a.heading = Math.atan2(dx, dz);
      // Stride rate is tuned for the unscaled model; shorter legs take more steps.
      a.phase += (moved * 11) / fit;
    }
    a.x = x;
    a.z = z;

    const task = worker.taskId === null ? undefined : game.tasks.find((t) => t.id === worker.taskId);
    let pose: Pose;
    if (activity === 'walking') {
      const s = Math.sin(a.phase);
      pose = { legL: s * 0.7, legR: -s * 0.7, armL: -s * 0.55, armR: s * 0.55, bend: 0.05, bob: Math.abs(s) * 0.025 };
    } else if (activity === 'working' && task) {
      pose = workPose(task.kind, a.time);
    } else {
      pose = { legL: 0, legR: 0, armL: 0.05, armR: -0.05, bend: 0, bob: Math.sin(a.time * 2) * 0.004 };
    }

    // Ease joints toward the pose so transitions between activities are smooth.
    const k = 1 - Math.exp(-14 * dt);
    root.position.set(x, MathUtils.lerp(root.position.y, pose.bob * fit, k), z);
    root.rotation.y += angleDelta(root.rotation.y, a.heading) * (1 - Math.exp(-10 * dt));
    legL.rotation.x = MathUtils.lerp(legL.rotation.x, pose.legL, k);
    legR.rotation.x = MathUtils.lerp(legR.rotation.x, pose.legR, k);
    armL.rotation.x = MathUtils.lerp(armL.rotation.x, pose.armL, k);
    armR.rotation.x = MathUtils.lerp(armR.rotation.x, pose.armR, k);
    upper.rotation.x = MathUtils.lerp(upper.rotation.x, pose.bend, k);

    for (const tool of TOOL_IDS) {
      const ref = rig.tools[tool].current;
      if (ref) ref.visible = task?.kind === tool;
    }
  });

  return <Person look={look} rig={rig} height={height} />;
}

/** All workers, animated from the game state every frame (no React re-renders while they move). */
export function Workers() {
  // Re-renders only when someone is hired or leaves.
  const ids = useGameStore((s) => s.game.workers.map((w) => w.id).join(','));
  return (
    <group>
      {ids
        .split(',')
        .filter(Boolean)
        .map((id) => (
          <WorkerFigure key={id} id={Number(id)} />
        ))}
    </group>
  );
}
