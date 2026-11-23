import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { createRef, useMemo, useRef } from 'react';
import { MathUtils, type Group } from 'three';
import { PERSON_HEIGHT } from '../data/scale';
import { GRID_SIZE } from '../data/world';
import type { TaskKind, Worker } from '../game/types';
import { workerActivity } from '../game/workers';
import { useGameStore } from '../store/gameStore';
import { hash01 } from './coords';
import { setHoverCursor } from './cursor';
import { Person, personScale, type PersonLook, type PersonRig } from './models/Person';

const HALF = GRID_SIZE / 2;
const TOOL_IDS: readonly TaskKind[] = ['hoe', 'seed', 'water', 'hand', 'fertilize', 'tend', 'build', 'haul'];
const STRAW = '#e2c27a';

const DEFAULT_LOOK: PersonLook = { shirt: '#3f6fb5', pants: '#4a5a7a', skin: '#e0ac85', hat: STRAW, hair: '#4a3324' };
/** Fixed looks for the starting crew (by name). */
const STARTING_LOOKS: Readonly<Record<string, PersonLook>> = {
  Antônio: DEFAULT_LOOK,
  Helena: { shirt: '#c8553d', pants: '#5a4a6a', skin: '#f0c8a0', hat: STRAW, hair: '#7a4a2a' },
  Lucas: { shirt: '#e3b23c', pants: '#3c5a8a', skin: '#d9a27a', hat: null, hair: '#3a2a1a' },
};
/** Day laborers wear high-visibility orange. */
const TEMP_SHIRT = '#e8762c';
const SHIRTS = ['#6a9a4a', '#b85c8a', '#5a8ab0', '#d07a3a', '#8a6ab0', '#c0a040', '#4aa090', '#a04a4a'];
const PANTS = ['#4a5a7a', '#5e4630', '#3c5a8a', '#6a6a5a'];
const SKINS = ['#f0c8a0', '#e0ac85', '#c68a5e', '#8d5a3b', '#f3d2b5'];
const HAIR = ['#2b2118', '#4a3324', '#7a4a2a', '#c8a060', '#1a1a1a'];

const pick = <T,>(list: readonly T[], r: number): T => list[Math.floor(r * list.length) % list.length] as T;

const lookFor = (worker: Worker): PersonLook => {
  const fixed = worker.kind === 'staff' ? STARTING_LOOKS[worker.name] : undefined;
  if (fixed) return fixed;
  const r = (k: number) => hash01(worker.id * 97 + k);
  return {
    shirt: worker.kind === 'temp' ? TEMP_SHIRT : pick(SHIRTS, r(1)),
    pants: pick(PANTS, r(2)),
    skin: pick(SKINS, r(3)),
    hair: pick(HAIR, r(4)),
    hat: r(5) < 0.6 ? STRAW : null,
  };
};

/** Height in meters: a random one around the adult default. */
const heightFor = (worker: Worker): number =>
  PERSON_HEIGHT.adult + (hash01(worker.id * 53 + 7) * 2 - 1) * PERSON_HEIGHT.variation;

/** Clicking a worker opens their card in the team hub (and never starts an area drag). */
const onDown = (e: ThreeEvent<PointerEvent>) => {
  if (e.button === 0) e.stopPropagation();
};
const onOut = () => setHoverCursor(false);
const onOver = (e: ThreeEvent<PointerEvent>) => {
  e.stopPropagation();
  setHoverCursor(true);
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

const workPose = (kind: TaskKind, t: number): Pose => {
  switch (kind) {
    case 'hoe': {
      const swing = Math.sin(t * 6.5) * 0.5 + 0.5;
      const arm = -0.4 - swing * 1.8;
      return { legL: -0.15, legR: 0.15, armL: arm, armR: arm, bend: 0.15 + (1 - swing) * 0.35, bob: 0 };
    }
    case 'seed':
    case 'fertilize':
      // Crouched, scattering from the bag.
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
    case 'tend':
      // Crouched at the shelter door, filling the bucket.
      return {
        legL: -0.6,
        legR: 0.35,
        armL: -0.5,
        armR: -0.9 + Math.sin(t * 3) * 0.3,
        bend: 0.6 + Math.sin(t * 3) * 0.05,
        bob: -0.06,
      };
    case 'build': {
      // Hammering: quick raise and strike, the other hand steadying the board.
      const strike = Math.max(0, Math.sin(t * 7));
      return { legL: -0.2, legR: 0.2, armL: -0.9, armR: -2.1 + strike * 1.2, bend: 0.2, bob: 0 };
    }
    case 'haul': {
      // Loading the vehicle: bend down for a crate, straighten up and swing it onto the bed.
      const lift = Math.sin(t * 2.6) * 0.5 + 0.5;
      const arms = -0.7 - lift * 0.6;
      return { legL: -0.25, legR: 0.25, armL: arms, armR: arms, bend: 0.75 - lift * 0.6, bob: -0.05 * (1 - lift) };
    }
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
      tools: {
        hoe: createRef<Group>(),
        seed: createRef<Group>(),
        water: createRef<Group>(),
        hand: createRef<Group>(),
        fertilize: createRef<Group>(),
        tend: createRef<Group>(),
        build: createRef<Group>(),
        haul: createRef<Group>(),
      },
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
      // Builders and carers stand beside the wall: face the footprint tile they work on.
      if (task.job?.type === 'structure' || task.job?.type === 'shelter') {
        const tx = (task.tile % GRID_SIZE) + 0.5 - HALF;
        const tz = Math.floor(task.tile / GRID_SIZE) + 0.5 - HALF;
        a.heading = Math.atan2(tx - x, tz - z);
      }
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

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    useGameStore.getState().selectWorker(id);
  };
  return (
    <group onClick={onClick} onPointerDown={onDown} onPointerOver={onOver} onPointerOut={onOut}>
      <Person look={look} rig={rig} height={height} />
    </group>
  );
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
