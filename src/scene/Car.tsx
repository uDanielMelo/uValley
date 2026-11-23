import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { meters } from '../data/scale';
import { GRID_SIZE } from '../data/world';
import { shipmentRoutes } from '../game/shipments';
import { shipmentCar } from '../game/visitors';
import { useGameStore } from '../store/gameStore';
import { hash01 } from './coords';
import { Pickup, WHEEL_RADIUS } from './models/Car';
import { CUSTOMER_CAR_COLORS } from './palette';

const HALF = GRID_SIZE / 2;

const angleDelta = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/**
 * One vehicle visiting the dock. Its position is derived every frame from its saved shipment and
 * the road network (game/visitors.ts); the routes are only rebuilt when the roads change.
 */
function ShipmentCar({ id, dockId }: { id: number; dockId: number }) {
  const tiles = useGameStore((s) => s.game.tiles);
  const structures = useGameStore((s) => s.game.structures);
  const routes = useMemo(() => shipmentRoutes({ tiles, structures }, dockId), [tiles, structures, dockId]);
  const root = useRef<Group>(null);
  const wheels = useRef<Array<Group | null>>([]);
  const last = useRef({ x: NaN, z: NaN, heading: NaN });
  const color = CUSTOMER_CAR_COLORS[Math.floor(hash01(id * 31 + 7) * CUSTOMER_CAR_COLORS.length)] ?? '#c0392b';

  useFrame((_, delta) => {
    const r = root.current;
    if (!r) return;
    const game = useGameStore.getState().game;
    const shipment = game.shipments.find((s) => s.id === id);
    const car = shipment && routes ? shipmentCar(shipment, game.gameMinutes, routes) : null;
    r.visible = car !== null;
    if (!car) {
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
      <Pickup color={color} wheels={wheels} />
    </group>
  );
}

/** The vehicles on their way to, parked at or leaving the dock. Re-renders only when one comes or goes. */
export function Cars() {
  const list = useGameStore((s) => s.game.shipments.map((x) => `${x.id}:${x.dockId}`).join(','));
  return (
    <>
      {list
        .split(',')
        .filter(Boolean)
        .map((entry) => {
          const [id, dockId] = entry.split(':').map(Number);
          return id === undefined || dockId === undefined ? null : <ShipmentCar key={id} id={id} dockId={dockId} />;
        })}
    </>
  );
}
