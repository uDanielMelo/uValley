import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Matrix4, MeshBasicMaterial, RingGeometry, type InstancedMesh } from 'three';
import { MAX_TASKS } from '../data/workers';
import type { Task, ToolId } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { indexToWorld } from './coords';
import { PALETTE } from './palette';

const noRaycast = () => null;

const COLORS: Record<ToolId, Color> = {
  hoe: new Color(PALETTE.taskHoe),
  seed: new Color(PALETTE.taskSeed),
  water: new Color(PALETTE.taskWater),
  hand: new Color(PALETTE.taskHand),
  fertilize: new Color(PALETTE.taskFertilize),
};
const ROAD = new Color(PALETTE.taskRoad);
const ROAD_REMOVE = new Color(PALETTE.taskRoadRemove);

/** Marker color for a task, or null when it has none (structure work shows as a site, chores need none). */
const colorOf = (task: Task): Color | null => {
  if (task.kind === 'tend' || task.kind === 'haul') return null;
  if (task.kind !== 'build') return COLORS[task.kind];
  if (task.job?.type !== 'road') return null;
  return task.job.remove ? ROAD_REMOVE : ROAD;
};

/** Square outline (a 4-segment ring rotated 45°) lying on the ground. */
const buildOutline = () => {
  const ring = new RingGeometry(0.56, 0.66, 4, 1, Math.PI / 4);
  ring.rotateX(-Math.PI / 2);
  return ring;
};

/** Colored outline on every tile with queued work, by the tile's next task. Pulses gently. */
export function TaskMarkers() {
  const ref = useRef<InstancedMesh>(null);
  const tasks = useGameStore((s) => s.game.tasks);
  const geometry = useMemo(buildOutline, []);
  const material = useMemo(
    () => new MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const seen = new Set<number>();
    let count = 0;
    for (const task of tasks) {
      if (seen.has(task.tile)) continue;
      seen.add(task.tile);
      const color = colorOf(task);
      if (!color) continue;
      const [x, z] = indexToWorld(task.tile);
      mesh.setMatrixAt(count, m.makeTranslation(x, 0.07, z));
      mesh.setColorAt(count, color);
      count++;
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [tasks]);

  useFrame(({ clock }) => {
    material.opacity = 0.6 + Math.sin(clock.elapsedTime * 3) * 0.25;
  });

  return <instancedMesh ref={ref} args={[geometry, material, MAX_TASKS]} raycast={noRaycast} renderOrder={2} />;
}
