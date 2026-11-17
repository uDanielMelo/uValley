import type { RefObject } from 'react';
import type { Group } from 'three';
import { METER_SCALE } from '../../data/scale';
import { LAMP_MATERIAL } from '../materials';

type Vec3 = [number, number, number];

/** Wheel radius in meters (the scene spins wheels by distance / radius). */
export const WHEEL_RADIUS = 0.38;

const GLASS = '#2f3e4a';
const TIRE = '#262626';
const RIM = '#b9bec2';
const CHROME = '#d9dde0';
const TAIL = '#d8352a';
const BED = '#3b3b3b';

function Block({ position, size, color, shadow = true }: { position: Vec3; size: Vec3; color: string; shadow?: boolean }) {
  return (
    <mesh position={position} castShadow={shadow} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} flatShading roughness={0.55} metalness={0.15} />
    </mesh>
  );
}

const WHEELS: readonly Vec3[] = [
  [-0.86, WHEEL_RADIUS, 1.55],
  [0.86, WHEEL_RADIUS, 1.55],
  [-0.86, WHEEL_RADIUS, -1.55],
  [0.86, WHEEL_RADIUS, -1.55],
];

/**
 * Low-poly pickup truck, authored in meters (5.2 × 1.9 × 1.8 m). Origin = ground under the
 * center, nose toward +z. `wheels` receives one ref per wheel so the scene can spin them.
 */
export function Pickup({ color, wheels }: { color: string; wheels: RefObject<Array<Group | null>> }) {
  return (
    <group scale={METER_SCALE}>
      {/* Chassis and lower body */}
      <Block position={[0, 0.78, 0]} size={[1.86, 0.62, 5.1]} color={color} />
      {/* Cab */}
      <Block position={[0, 1.42, 0.25]} size={[1.72, 0.7, 1.9]} color={color} />
      <Block position={[0, 1.42, 1.21]} size={[1.6, 0.56, 0.04]} color={GLASS} shadow={false} />
      <Block position={[0, 1.44, -0.71]} size={[1.5, 0.46, 0.04]} color={GLASS} shadow={false} />
      <Block position={[-0.87, 1.44, 0.3]} size={[0.04, 0.48, 1.6]} color={GLASS} shadow={false} />
      <Block position={[0.87, 1.44, 0.3]} size={[0.04, 0.48, 1.6]} color={GLASS} shadow={false} />
      {/* Hood slope and grille */}
      <Block position={[0, 1.12, 1.9]} size={[1.8, 0.08, 1.2]} color={color} />
      <Block position={[0, 0.82, 2.56]} size={[1.5, 0.36, 0.04]} color={CHROME} shadow={false} />
      <Block position={[0, 0.52, 2.58]} size={[1.9, 0.14, 0.1]} color={CHROME} />
      {/* Headlights glow at night */}
      {[-0.68, 0.68].map((x) => (
        <mesh key={x} position={[x, 0.86, 2.56]} material={LAMP_MATERIAL}>
          <boxGeometry args={[0.3, 0.16, 0.05]} />
        </mesh>
      ))}
      {/* Bed: dark floor with side walls and tailgate */}
      <Block position={[0, 1.1, -1.65]} size={[1.7, 0.04, 1.8]} color={BED} shadow={false} />
      <Block position={[-0.9, 1.25, -1.65]} size={[0.07, 0.32, 1.8]} color={color} />
      <Block position={[0.9, 1.25, -1.65]} size={[0.07, 0.32, 1.8]} color={color} />
      <Block position={[0, 1.25, -2.53]} size={[1.86, 0.32, 0.06]} color={color} />
      {[-0.72, 0.72].map((x) => (
        <Block key={x} position={[x, 0.95, -2.57]} size={[0.24, 0.22, 0.04]} color={TAIL} shadow={false} />
      ))}
      <Block position={[0, 0.5, -2.58]} size={[1.9, 0.14, 0.1]} color={CHROME} />
      {/* Wheels: tire + rim, spun around x by the scene */}
      {WHEELS.map((position, i) => (
        <group
          key={i}
          position={position}
          ref={(el) => {
            wheels.current[i] = el;
          }}
        >
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, 0.28, 10]} />
            <meshStandardMaterial color={TIRE} flatShading roughness={0.9} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[position[0] > 0 ? 0.08 : -0.08, 0, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.14, 6]} />
            <meshStandardMaterial color={RIM} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}
