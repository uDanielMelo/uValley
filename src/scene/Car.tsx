import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { VEHICLES } from '../data/market';
import { meters } from '../data/scale';
import { GRID_SIZE } from '../data/world';
import { carRoutes, carState } from '../game/visitors';
import { useGameStore } from '../store/gameStore';
import { Pickup, WHEEL_RADIUS } from './models/Car';

const HALF = GRID_SIZE / 2;

const angleDelta = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/**
 * The farm's vehicle coming back from town to pick up the load. Its position is derived every frame
 * from the game clock and the road network (game/visitors.ts); its color and size follow the
 * vehicle level, so it only re-renders on an upgrade.
 */
export function Car() {
  const tiles = useGameStore((s) => s.game.tiles);
  const routes = useMemo(() => carRoutes(tiles), [tiles]);
  const root = useRef<Group>(null);
  const wheels = useRef<Array<Group | null>>([]);
  const last = useRef({ x: NaN, z: NaN, heading: NaN });
  const level = useGameStore((s) => s.game.vehicleLevel);
  const vehicle = VEHICLES[level];

  useFrame((_, delta) => {
    const r = root.current;
    if (!r) return;
    const car = carState(useGameStore.getState().game.gameMinutes, routes);
    r.visible = car.phase !== 'away';
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
      <group scale={vehicle.scale}>
        <Pickup color={vehicle.color} wheels={wheels} />
      </group>
    </group>
  );
}
