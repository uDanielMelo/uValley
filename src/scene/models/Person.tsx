import type { RefObject } from 'react';
import type { Group } from 'three';
import { meters } from '../../data/scale';
import type { TaskKind } from '../../game/types';

export interface PersonLook {
  shirt: string;
  pants: string;
  skin: string;
  hat: string | null;
  hair: string;
}

/** Refs to the animated joints of a person. */
type GroupRef = RefObject<Group | null>;

export interface PersonRig {
  root: GroupRef;
  /** Upper body, pivoting at the hips (for bending). */
  upper: GroupRef;
  legL: GroupRef;
  legR: GroupRef;
  armL: GroupRef;
  armR: GroupRef;
  /** Tool held in the right hand, one per task kind (a hammer for construction). */
  tools: Record<TaskKind, GroupRef>;
}

type Vec3 = [number, number, number];

function Box({ size, position, color, rotation }: { size: Vec3; position: Vec3; color: string; rotation?: Vec3 }) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} flatShading roughness={0.9} />
    </mesh>
  );
}

function Cyl({ args, position, color, rotation }: { args: [number, number, number, number]; position: Vec3; color: string; rotation?: Vec3 }) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <cylinderGeometry args={args} />
      <meshStandardMaterial color={color} flatShading roughness={0.9} />
    </mesh>
  );
}

/** Hip height: legs hang from here and the upper body pivots here. */
const HIP = 0.34;
/** Top of the head in model units (the model is fitted to the person's real height). */
const MODEL_HEIGHT = HIP + 0.49;

/** Uniform scale that turns the model into a person `height` meters tall. */
export const personScale = (height: number): number => meters(height) / MODEL_HEIGHT;
const WOOD = '#8a6239';
const METAL = '#9aa3a8';
const CAN = '#6f9fb0';
const SACK = '#d8c08e';
const BASKET = '#c08a4a';
const MANURE_BAG = '#7a5230';

/** Tools held in the right hand; only the one for the current task is shown. */
function Tools({ tools }: { tools: PersonRig['tools'] }) {
  return (
    <group position={[0, -0.26, 0.02]}>
      <group ref={tools.hoe} visible={false}>
        <Box size={[0.025, 0.5, 0.025]} position={[0, 0.0, 0.05]} color={WOOD} rotation={[1.2, 0, 0]} />
        <Box size={[0.1, 0.03, 0.07]} position={[0, -0.1, 0.27]} color={METAL} rotation={[1.2, 0, 0]} />
      </group>
      <group ref={tools.water} visible={false}>
        <Cyl args={[0.06, 0.07, 0.12, 6]} position={[0, -0.04, 0.03]} color={CAN} />
        <Box size={[0.02, 0.02, 0.14]} position={[0, -0.01, 0.12]} color={CAN} rotation={[-0.5, 0, 0]} />
      </group>
      <group ref={tools.seed} visible={false}>
        <Box size={[0.11, 0.12, 0.08]} position={[0, -0.05, 0.03]} color={SACK} />
      </group>
      <group ref={tools.fertilize} visible={false}>
        <Box size={[0.12, 0.13, 0.09]} position={[0, -0.05, 0.03]} color={MANURE_BAG} />
      </group>
      <group ref={tools.hand} visible={false}>
        <Cyl args={[0.08, 0.06, 0.08, 7]} position={[0, -0.06, 0.04]} color={BASKET} />
      </group>
      <group ref={tools.tend} visible={false}>
        <Cyl args={[0.07, 0.055, 0.1, 8]} position={[0, -0.07, 0.04]} color={METAL} />
      </group>
      <group ref={tools.build} visible={false}>
        <Box size={[0.022, 0.2, 0.022]} position={[0, -0.03, 0.06]} color={WOOD} rotation={[1.3, 0, 0]} />
        <Box size={[0.05, 0.05, 0.1]} position={[0, -0.06, 0.15]} color={METAL} rotation={[1.3, 0, 0]} />
      </group>
    </group>
  );
}

/**
 * Low-poly farmer, scaled to `height` meters. Origin at the feet; faces +z.
 * Legs and arms hang from pivot groups so they can swing.
 */
export function Person({ look, rig, height }: { look: PersonLook; rig: PersonRig; height: number }) {
  return (
    <group ref={rig.root}>
      <group scale={personScale(height)}>
      {/* Legs */}
      <group ref={rig.legL} position={[-0.06, HIP, 0]}>
        <Box size={[0.09, 0.32, 0.1]} position={[0, -0.16, 0]} color={look.pants} />
        <Box size={[0.1, 0.05, 0.14]} position={[0, -0.31, 0.02]} color="#4a3324" />
      </group>
      <group ref={rig.legR} position={[0.06, HIP, 0]}>
        <Box size={[0.09, 0.32, 0.1]} position={[0, -0.16, 0]} color={look.pants} />
        <Box size={[0.1, 0.05, 0.14]} position={[0, -0.31, 0.02]} color="#4a3324" />
      </group>
      {/* Upper body, relative to the hips */}
      <group ref={rig.upper} position={[0, HIP, 0]}>
        <Box size={[0.25, 0.3, 0.15]} position={[0, 0.15, 0]} color={look.shirt} />
        <Box size={[0.26, 0.06, 0.16]} position={[0, 0.02, 0]} color={look.pants} />
        <group ref={rig.armL} position={[-0.16, 0.28, 0]}>
          <Box size={[0.07, 0.25, 0.08]} position={[0, -0.12, 0]} color={look.shirt} />
          <Box size={[0.06, 0.05, 0.06]} position={[0, -0.27, 0]} color={look.skin} />
        </group>
        <group ref={rig.armR} position={[0.16, 0.28, 0]}>
          <Box size={[0.07, 0.25, 0.08]} position={[0, -0.12, 0]} color={look.shirt} />
          <Box size={[0.06, 0.05, 0.06]} position={[0, -0.27, 0]} color={look.skin} />
          <Tools tools={rig.tools} />
        </group>
        {/* Head */}
        <Box size={[0.17, 0.17, 0.16]} position={[0, 0.39, 0]} color={look.skin} />
        <Box size={[0.18, 0.06, 0.17]} position={[0, 0.46, -0.01]} color={look.hair} />
        <Box size={[0.03, 0.03, 0.02]} position={[-0.04, 0.4, 0.08]} color="#2b2118" />
        <Box size={[0.03, 0.03, 0.02]} position={[0.04, 0.4, 0.08]} color="#2b2118" />
        {look.hat && (
          <group position={[0, 0.49, 0]}>
            <Cyl args={[0.17, 0.17, 0.02, 10]} position={[0, 0, 0]} color={look.hat} />
            <Cyl args={[0.08, 0.09, 0.08, 8]} position={[0, 0.045, 0]} color={look.hat} />
            <Cyl args={[0.092, 0.092, 0.02, 8]} position={[0, 0.02, 0]} color="#8a3b2b" />
          </group>
        )}
      </group>
      </group>
    </group>
  );
}
