import { useFrame } from '@react-three/fiber';
import { createRef, useMemo, useRef, useState } from 'react';
import type { Group } from 'three';
import { GRID_SIZE } from '../data/world';
import { TILE_METERS } from '../data/scale';
import { MACHINE_IDS, type MachineId } from '../data/machines';
import { machinePose } from '../game/machines';
import { useGameStore, type GameStore } from '../store/gameStore';
import { drive } from './drive';
import { Harvester, Tractor } from './models/Machines';

const HALF = GRID_SIZE / 2;
/** Wheel radii (m) in the models' wheel order: two big, two small. */
const WHEEL_RADII: Record<MachineId, readonly number[]> = { tractor: [0.8, 0.8, 0.45, 0.45], harvester: [0.8, 0.8, 0.5, 0.5] };
/** How fast the machine turns toward where it is going (per second). */
const TURN_RATE = 6;
const REEL_SPEED = 3;

const isMachineId = (v: string): v is MachineId => MACHINE_IDS.some((id) => id === v);

/** "id:type" per machine: changes only when machines are bought, rented or leave. */
const machinesKey = (s: GameStore): string => s.game.machines.map((m) => `${m.id}:${m.type}`).join('|');

/** One machine: parked in its slot or rolling under its driver, wheels and reel turning. */
function MachineFigure({ id, type }: { id: number; type: MachineId }) {
  const root = useRef<Group>(null);
  const reel = useRef<Group>(null);
  const wheels = useMemo(() => [createRef<Group>(), createRef<Group>(), createRef<Group>(), createRef<Group>()], []);
  const [driven, setDriven] = useState(false);
  const anim = useRef({ x: NaN, z: NaN, heading: 0 });

  useFrame((_, delta) => {
    const { game, settings } = useGameStore.getState();
    const machine = game.machines.find((m) => m.id === id);
    const group = root.current;
    if (!machine || !group) return;
    const dt = Math.min(delta, 0.1);

    // Driven by the player (WASD): the ride's pose as is, wheels rolling by its speed (backwards in reverse).
    const ride = drive.ride?.machineId === id ? drive.ride : null;
    if (ride) {
      const a = anim.current;
      a.x = ride.x - HALF;
      a.z = ride.y - HALF;
      a.heading = ride.heading;
      group.visible = true;
      group.position.set(a.x, 0, a.z);
      group.rotation.y = a.heading;
      const meters = ride.speed * dt;
      WHEEL_RADII[type].forEach((r, i) => {
        const wheel = wheels[i]?.current;
        if (wheel) wheel.rotation.x += meters / r;
      });
      if (reel.current && Math.abs(ride.speed) > 0.1) reel.current.rotation.x += dt * REEL_SPEED;
      if (!driven) setDriven(true);
      return;
    }

    const pose = machinePose(game, machine);
    group.visible = pose !== null;
    if (!pose) return;
    const a = anim.current;
    const x = pose.x - HALF;
    const z = pose.y - HALF;
    if (Number.isNaN(a.x)) {
      a.x = x;
      a.z = z;
      a.heading = pose.heading === null ? 0 : (pose.heading * Math.PI) / 2;
    }
    const dx = x - a.x;
    const dz = z - a.z;
    const moved = Math.hypot(dx, dz);
    // Parked: snap to the slot's facing. Driven: turn smoothly toward the way it moves.
    const target = pose.heading !== null ? (pose.heading * Math.PI) / 2 : moved > 1e-4 ? Math.atan2(dx, dz) : a.heading;
    let turn = target - a.heading;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    a.heading += pose.heading !== null && moved > 0.5 ? turn : turn * Math.min(1, dt * TURN_RATE);
    a.x = x;
    a.z = z;
    group.position.set(x, 0, z);
    group.rotation.y = a.heading;

    // Wheels roll by the distance covered (world units are tiles).
    const meters = moved * TILE_METERS;
    WHEEL_RADII[type].forEach((r, i) => {
      const wheel = wheels[i]?.current;
      if (wheel) wheel.rotation.x += meters / r;
    });
    if (reel.current && pose.working) reel.current.rotation.x += dt * REEL_SPEED * settings.speed;
    const isDriven = pose.heading === null;
    if (isDriven !== driven) setDriven(isDriven);
  });

  const Model = type === 'tractor' ? Tractor : Harvester;
  return (
    <group ref={root}>
      <Model wheelRefs={wheels} reelRef={reel} driven={driven} />
    </group>
  );
}

/** Every machine of the farm. */
export function Machines() {
  const key = useGameStore(machinesKey);
  const list = useMemo(
    () =>
      key
        .split('|')
        .filter(Boolean)
        .flatMap((entry) => {
          const [idText, type] = entry.split(':');
          return type && isMachineId(type) ? [{ id: Number(idText), type }] : [];
        }),
    [key],
  );
  return (
    <group>
      {list.map((m) => (
        <MachineFigure key={m.id} id={m.id} type={m.type} />
      ))}
    </group>
  );
}
