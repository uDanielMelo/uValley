import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import type { Group } from 'three';
import { meters } from '../data/scale';
import { GRID_SIZE } from '../data/world';
import { carRoute, carState } from '../game/visitors';
import { useGameStore } from '../store/gameStore';
import { Pickup, WHEEL_RADIUS } from './models/Car';

const HALF = GRID_SIZE / 2;
/** Body colors, one per visit of the day. */
const CAR_COLORS = ['#c0392b', '#2e6da4', '#e8e4da', '#3c8d50'] as const;

const angleDelta = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/**
 * The visiting pickup. Its position is derived every frame from the game clock and the road
 * network (game/visitors.ts); this component only re-renders when the visit (color) changes.
 */
export function Car() {
  const tiles = useGameStore((s) => s.game.tiles);
  const route = useMemo(() => carRoute(tiles), [tiles]);
  const root = useRef<Group>(null);
  const wheels = useRef<Array<Group | null>>([]);
  const last = useRef({ x: NaN, z: NaN, heading: NaN });
  const [visit, setVisit] = useState(0);

  useFrame((_, delta) => {
    const r = root.current;
    if (!r) return;
    const car = carState(useGameStore.getState().game.gameMinutes, route);
    r.visible = car.phase !== 'away';
    if (car.visit !== visit) setVisit(car.visit);
    if (!r.visible) {
      last.current = { x: NaN, z: NaN, heading: NaN };
      return;
    }
    const x = car.x - HALF;
    const z = car.y - HALF;
    const l = last.current;
    const dt = Math.min(delta, 0.1);
    // Ease the heading so corners and the turn-around look like steering, not snapping.
    const heading = Number.isNaN(l.heading) ? car.heading : l.heading + angleDelta(l.heading, car.heading) * (1 - Math.exp(-5 * dt));
    const moved = Number.isNaN(l.x) ? 0 : Math.hypot(x - l.x, z - l.z);
    r.position.set(x, 0, z);
    r.rotation.y = heading;
    const spin = moved / meters(WHEEL_RADIUS);
    for (const wheel of wheels.current) if (wheel) wheel.rotation.x += spin;
    last.current = { x, z, heading };
  });

  return (
    <group ref={root} visible={false}>
      <Pickup color={CAR_COLORS[visit % CAR_COLORS.length] ?? CAR_COLORS[0]} wheels={wheels} />
    </group>
  );
}
