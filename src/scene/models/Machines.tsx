import type { Ref } from 'react';
import { DoubleSide, type Group } from 'three';
import { Block, CONCRETE, Glass, Meters } from './Buildings';
import { MACHINE_COLORS as C } from '../palette';

/**
 * Farm machines and their buildings, authored in METERS (see data/scale.ts). Origin = center on
 * the ground, front faces +z. Generic colors, no maker's livery or logo.
 */

type Vec3 = [number, number, number];

/** A tire with a hub; the group spins around x (its ref is turned by the scene as it rolls). */
function Wheel({ position, radius, width, wheelRef }: { position: Vec3; radius: number; width: number; wheelRef?: Ref<Group> }) {
  return (
    <group position={position} ref={wheelRef}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[radius, radius, width, 12]} />
        <meshStandardMaterial color={C.tire} flatShading roughness={0.95} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius * 0.55, radius * 0.55, width + 0.04, 8]} />
        <meshStandardMaterial color={C.hub} flatShading roughness={0.6} />
      </mesh>
      {/* Tread block, so the spin shows */}
      <Block position={[0, radius - 0.04, 0]} size={[width + 0.02, 0.1, 0.18]} color={C.tireTread} shadow={false} />
    </group>
  );
}

/** Someone sitting at the wheel (shown while a machine is driven). */
function Driver({ position }: { position: Vec3 }) {
  const [x, y, z] = position;
  return (
    <group>
      <Block position={[x, y + 0.35, z]} size={[0.42, 0.6, 0.3]} color={C.driverShirt} shadow={false} />
      <Block position={[x, y + 0.8, z + 0.02]} size={[0.24, 0.26, 0.24]} color={C.driverSkin} shadow={false} />
      <Block position={[x, y + 0.96, z + 0.02]} size={[0.3, 0.08, 0.3]} color={C.driverHat} shadow={false} />
    </group>
  );
}

export interface MachineModelProps {
  /** Wheel groups, turned by the scene as the machine rolls. */
  wheelRefs?: Ref<Group>[];
  /** The harvester's reel, turned while it works. */
  reelRef?: Ref<Group>;
  driven?: boolean;
}

/** Tractor ≈ 4.2 × 2.2 × 2.8 m with a three-disc plow behind. */
export function Tractor({ wheelRefs = [], driven = false }: MachineModelProps) {
  return (
    <Meters>
      {/* Frame, engine and hood */}
      <Block position={[0, 0.75, 0.2]} size={[0.8, 0.5, 3.2]} color={C.graphite} />
      <Block position={[0, 1.2, 1.0]} size={[0.95, 0.75, 1.9]} color={C.tractorBody} />
      <Block position={[0, 1.2, 1.97]} size={[0.85, 0.6, 0.06]} color={C.grille} shadow={false} />
      <Glass position={[0.32, 1.38, 1.98]} size={[0.16, 0.1, 0.04]} />
      <Glass position={[-0.32, 1.38, 1.98]} size={[0.16, 0.1, 0.04]} />
      {/* Exhaust stack */}
      <mesh position={[0.3, 2.0, 1.25]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 1.2, 6]} />
        <meshStandardMaterial color={C.graphite} flatShading />
      </mesh>
      {/* Fenders over the rear wheels */}
      <Block position={[0.92, 1.62, -0.75]} size={[0.6, 0.08, 1.4]} color={C.tractorBody} />
      <Block position={[-0.92, 1.62, -0.75]} size={[0.6, 0.08, 1.4]} color={C.tractorBody} />
      {/* Cab: floor, posts, roof and glass */}
      <Block position={[0, 1.15, -0.75]} size={[1.3, 0.2, 1.3]} color={C.graphite} />
      {(
        [
          [0.62, 0.62],
          [-0.62, 0.62],
          [0.62, -0.62],
          [-0.62, -0.62],
        ] as const
      ).map(([px, pz]) => (
        <Block key={`${px}${pz}`} position={[px, 1.95, -0.75 + pz]} size={[0.07, 1.4, 0.07]} color={C.graphite} />
      ))}
      <Block position={[0, 2.7, -0.75]} size={[1.45, 0.12, 1.45]} color={C.tractorBody} />
      <Glass position={[0, 2.0, -0.12]} size={[1.18, 1.1, 0.03]} />
      <Glass position={[0.62, 2.0, -0.75]} size={[0.03, 0.9, 1.15]} />
      <Glass position={[-0.62, 2.0, -0.75]} size={[0.03, 0.9, 1.15]} />
      <Block position={[0, 1.5, -1.0]} size={[0.5, 0.15, 0.45]} color={C.seat} shadow={false} />
      {driven && <Driver position={[0, 1.45, -0.95]} />}
      {/* Wheels: big rear (Ø 1.6 m), small front (Ø 0.9 m) */}
      <Wheel wheelRef={wheelRefs[0]} position={[0.92, 0.8, -0.75]} radius={0.8} width={0.5} />
      <Wheel wheelRef={wheelRefs[1]} position={[-0.92, 0.8, -0.75]} radius={0.8} width={0.5} />
      <Wheel wheelRef={wheelRefs[2]} position={[0.72, 0.45, 1.35]} radius={0.45} width={0.3} />
      <Wheel wheelRef={wheelRefs[3]} position={[-0.72, 0.45, 1.35]} radius={0.45} width={0.3} />
      {/* Three-disc plow on the hitch */}
      <Block position={[0, 0.7, -1.75]} size={[0.15, 0.15, 0.7]} color={C.graphite} />
      <Block position={[0, 0.7, -2.15]} size={[1.6, 0.14, 0.14]} color={C.implement} rotation={[0, 0.35, 0]} />
      {[-0.55, 0, 0.55].map((dx, i) => (
        <group key={dx} position={[dx, 0.35, -2.15 - (i - 1) * 0.2]} rotation={[0, 0.35, 0.3]}>
          <Block position={[0, 0.3, 0]} size={[0.08, 0.5, 0.08]} color={C.implement} />
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.3, 0.3, 0.04, 10]} />
            <meshStandardMaterial color={C.steel} flatShading metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
      ))}
    </Meters>
  );
}

/** Combine harvester ≈ 7.5 × 3.5 × 3.8 m: header with reel in front, cab, grain tank, folded unloading auger. */
export function Harvester({ wheelRefs = [], reelRef, driven = false }: MachineModelProps) {
  return (
    <Meters>
      {/* Body and grain tank */}
      <Block position={[0, 2.0, -0.9]} size={[2.6, 2.4, 4.6]} color={C.harvesterBody} />
      <Block position={[0, 3.45, -1.3]} size={[2.3, 0.6, 2.6]} color={C.harvesterTrim} />
      <Block position={[0, 1.0, -0.9]} size={[2.7, 0.3, 4.7]} color={C.graphite} />
      {/* Engine grille at the back */}
      <Block position={[0, 2.4, -3.22]} size={[1.8, 1.0, 0.06]} color={C.grille} shadow={false} />
      {/* Cab up front */}
      <Block position={[0, 3.25, 1.35]} size={[1.6, 0.12, 1.5]} color={C.harvesterTrim} />
      <Block position={[0, 3.8, 1.35]} size={[1.7, 0.12, 1.6]} color={C.harvesterBody} />
      <Glass position={[0, 3.52, 2.12]} size={[1.5, 0.55, 0.03]} />
      <Glass position={[0.8, 3.52, 1.35]} size={[0.03, 0.55, 1.4]} />
      <Glass position={[-0.8, 3.52, 1.35]} size={[0.03, 0.55, 1.4]} />
      {driven && <Driver position={[0, 2.95, 1.3]} />}
      {/* Feeder to the header */}
      <Block position={[0, 1.2, 2.0]} size={[1.3, 0.8, 1.6]} color={C.harvesterBody} rotation={[0.25, 0, 0]} />
      {/* Header: wide platform with dividers and the reel */}
      <Block position={[0, 0.45, 3.1]} size={[4.6, 0.35, 1.3]} color={C.harvesterTrim} />
      <Block position={[0, 0.85, 2.55]} size={[4.6, 0.8, 0.12]} color={C.harvesterTrim} />
      <Block position={[2.3, 0.7, 3.1]} size={[0.1, 0.6, 1.3]} color={C.harvesterBody} />
      <Block position={[-2.3, 0.7, 3.1]} size={[0.1, 0.6, 1.3]} color={C.harvesterBody} />
      <group ref={reelRef} position={[0, 1.25, 3.2]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 4.4, 6]} />
          <meshStandardMaterial color={C.steel} flatShading />
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2;
          return (
            <Block
              key={i}
              position={[0, Math.sin(a) * 0.45, Math.cos(a) * 0.45]}
              size={[4.3, 0.06, 0.06]}
              color={C.reel}
              shadow={false}
            />
          );
        })}
      </group>
      {/* Unloading auger folded along the left side */}
      <mesh position={[-1.45, 3.3, -0.6]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.14, 4.0, 8]} />
        <meshStandardMaterial color={C.harvesterTrim} flatShading />
      </mesh>
      {/* Big drive wheels in front, small steering wheels behind */}
      <Wheel wheelRef={wheelRefs[0]} position={[1.45, 0.8, 0.8]} radius={0.8} width={0.6} />
      <Wheel wheelRef={wheelRefs[1]} position={[-1.45, 0.8, 0.8]} radius={0.8} width={0.6} />
      <Wheel wheelRef={wheelRefs[2]} position={[1.2, 0.5, -2.6]} radius={0.5} width={0.4} />
      <Wheel wheelRef={wheelRefs[3]} position={[-1.2, 0.5, -2.6]} radius={0.5} width={0.4} />
    </Meters>
  );
}

const SHED_W = 10.5;
const SHED_D = 7;
const EAVE = 4.2;
/** Slot centers along x (the scene's slot math: slot 0 sits at +x). */
const SHED_SLOTS = [3.5, 0, -3.5];

/** Low arched roof over the shed (an arc of a big cylinder, open underneath). */
function ArchedRoof() {
  const radius = 6;
  const half = Math.asin(SHED_D / 2 / radius);
  const center = EAVE - radius * Math.cos(half);
  return (
    <mesh position={[0, center, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, SHED_W + 0.4, 14, 1, true, Math.PI / 2 - half, half * 2]} />
      <meshStandardMaterial color={C.shedRoof} flatShading side={DoubleSide} roughness={0.7} metalness={0.2} />
    </mesh>
  );
}

/** Machine shed 10.5 × 7 m: steel frame open in front, arched roof, three painted bays. */
export function MachineShed() {
  return (
    <Meters>
      <Block position={[0, 0.08, 0]} size={[SHED_W - 0.2, 0.16, SHED_D - 0.2]} color={CONCRETE} />
      {/* Back and side walls */}
      <Block position={[0, EAVE / 2, -SHED_D / 2 + 0.1]} size={[SHED_W, EAVE, 0.15]} color={C.shedWall} />
      <Block position={[SHED_W / 2 - 0.08, EAVE / 2, -0.4]} size={[0.15, EAVE, SHED_D - 0.8]} color={C.shedWall} />
      <Block position={[-SHED_W / 2 + 0.08, EAVE / 2, -0.4]} size={[0.15, EAVE, SHED_D - 0.8]} color={C.shedWall} />
      {/* Front posts between the bays and the beam over the opening */}
      {[-5.15, -1.75, 1.75, 5.15].map((x) => (
        <Block key={x} position={[x, EAVE / 2, SHED_D / 2 - 0.15]} size={[0.2, EAVE, 0.2]} color={C.shedFrame} />
      ))}
      <Block position={[0, EAVE - 0.2, SHED_D / 2 - 0.15]} size={[SHED_W, 0.35, 0.22]} color={C.shedFrame} />
      <ArchedRoof />
      {/* Bay lines on the floor */}
      {[-5.0, -1.75, 1.75, 5.0].map((x) => (
        <Block key={x} position={[x, 0.17, 0.2]} size={[0.1, 0.02, SHED_D - 1.2]} color={C.paint} shadow={false} />
      ))}
      {SHED_SLOTS.map((x) => (
        <Block key={x} position={[x, 0.17, SHED_D / 2 - 0.5]} size={[2.6, 0.02, 0.1]} color={C.paint} shadow={false} />
      ))}
    </Meters>
  );
}

/** The workshop the shed gains at level 2: bench, tool wall, compressor, jack and a sign. */
export function ShedWorkshop() {
  return (
    <Meters>
      {/* Workbench and tool board against the back wall, between the middle and right bays */}
      <Block position={[1.75, 0.5, -SHED_D / 2 + 0.55]} size={[2.2, 0.9, 0.8]} color={C.bench} />
      <Block position={[1.75, 0.97, -SHED_D / 2 + 0.55]} size={[2.3, 0.08, 0.85]} color={C.benchTop} />
      <Block position={[1.75, 2.0, -SHED_D / 2 + 0.22]} size={[2.2, 1.2, 0.05]} color={C.toolBoard} />
      {[-0.7, -0.3, 0.1, 0.5, 0.85].map((dx, i) => (
        <Block key={dx} position={[1.75 + dx, 2.0 + (i % 2) * 0.2, -SHED_D / 2 + 0.27]} size={[0.06, 0.45, 0.04]} color={C.steel} shadow={false} />
      ))}
      {/* Compressor tank on wheels */}
      <mesh position={[-1.75, 0.45, -SHED_D / 2 + 0.6]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.9, 10]} />
        <meshStandardMaterial color={C.compressor} flatShading />
      </mesh>
      <Block position={[-1.75, 0.85, -SHED_D / 2 + 0.6]} size={[0.35, 0.25, 0.3]} color={C.graphite} />
      {/* Floor jack */}
      <Block position={[-0.6, 0.25, -SHED_D / 2 + 1.0]} size={[0.35, 0.18, 0.9]} color={C.compressor} />
      <Block position={[-0.6, 0.5, -SHED_D / 2 + 1.5]} size={[0.05, 0.05, 0.8]} color={C.steel} rotation={[0.6, 0, 0]} />
      {/* Workshop sign on the front beam: a plate with a crossed wrench */}
      <Block position={[0, EAVE + 0.35, SHED_D / 2 - 0.1]} size={[2.4, 0.6, 0.08]} color={C.sign} />
      <Block position={[0, EAVE + 0.35, SHED_D / 2 - 0.04]} size={[0.9, 0.12, 0.03]} color={C.signMark} shadow={false} rotation={[0, 0, 0.6]} />
      <Block position={[0, EAVE + 0.35, SHED_D / 2 - 0.04]} size={[0.9, 0.12, 0.03]} color={C.signMark} shadow={false} rotation={[0, 0, -0.6]} />
    </Meters>
  );
}

/** Parking lot 7 × 7 m: gravel pad, curbs on three sides and two marked bays. */
export function ParkingLot() {
  return (
    <Meters>
      <Block position={[0, 0.06, 0]} size={[6.8, 0.12, 6.8]} color={C.gravel} shadow={false} />
      <Block position={[0, 0.15, -3.35]} size={[6.8, 0.18, 0.15]} color={CONCRETE} />
      <Block position={[3.35, 0.15, 0]} size={[0.15, 0.18, 6.8]} color={CONCRETE} />
      <Block position={[-3.35, 0.15, 0]} size={[0.15, 0.18, 6.8]} color={CONCRETE} />
      {[-3.1, 0, 3.1].map((x) => (
        <Block key={x} position={[x, 0.13, -0.3]} size={[0.1, 0.02, 5.6]} color={C.paint} shadow={false} />
      ))}
      {/* Wheel stops at the back of each bay */}
      {[1.75, -1.75].map((x) => (
        <Block key={x} position={[x, 0.2, -2.9]} size={[1.6, 0.15, 0.25]} color={CONCRETE} />
      ))}
    </Meters>
  );
}
