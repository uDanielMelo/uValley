import { DoubleSide } from 'three';
import { TILE_METERS } from '../../data/scale';
import { STRUCTURES, type ShelterLevel, type StructureId } from '../../data/structures';
import { LAMP_MATERIAL } from '../materials';
import { Block, CONCRETE, HAY, Meters, WOOD, WOOD_DARK } from './Buildings';

/**
 * Pieces each shelter level adds on top of the base model, in METERS and in the model's own frame
 * (origin at the footprint center, front +z). Level 2 (reinforced) adds the shelter's own
 * improvement; level 3 (comfortable) adds a lantern by the door and a comfort detail.
 */

const METAL = '#8f969d';
const METAL_DARK = '#5f666c';

/** Lantern post that lights up at night (shared lamp material). */
function Lantern({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Block position={[0, 1.1, 0]} size={[0.12, 2.2, 0.12]} color={WOOD_DARK} />
      <Block position={[0.18, 2.1, 0]} size={[0.4, 0.06, 0.06]} color={WOOD_DARK} shadow={false} />
      <mesh position={[0.34, 1.92, 0]} material={LAMP_MATERIAL}>
        <boxGeometry args={[0.2, 0.26, 0.2]} />
      </mesh>
    </group>
  );
}

/** Metal gate panel (vertical bars between two rails). */
function MetalGate({ x, z, width, height }: { x: number; z: number; width: number; height: number }) {
  const bars = Math.max(3, Math.round(width / 0.25));
  return (
    <group position={[x, 0, z]}>
      {[0.15, height].map((y) => (
        <Block key={y} position={[0, y, 0]} size={[width, 0.06, 0.06]} color={METAL_DARK} shadow={false} />
      ))}
      {Array.from({ length: bars + 1 }, (_, i) => (
        <Block
          key={i}
          position={[-width / 2 + (width * i) / bars, (height + 0.15) / 2, 0]}
          size={[0.04, height - 0.15, 0.04]}
          color={METAL}
          shadow={false}
        />
      ))}
    </group>
  );
}

/** Level 2: each shelter's own reinforcement. */
function Reinforced({ type }: { type: StructureId }) {
  switch (type) {
    case 'chickenCoop':
      // Wire mesh roof over the run, on metal corner posts.
      return (
        <group>
          <mesh position={[1.4, 1.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[3.9, 3.0]} />
            <meshStandardMaterial color="#c9cdc8" transparent opacity={0.3} side={DoubleSide} depthWrite={false} />
          </mesh>
          {[-0.55, 3.35].flatMap((x) =>
            [-1.5, 1.5].map((z) => <Block key={`${x}${z}`} position={[x, 0.63, z]} size={[0.07, 1.26, 0.07]} color={METAL} />),
          )}
        </group>
      );
    case 'pigsty':
      // Concrete floor along the trough side of the pen.
      return <Block position={[1.3, 0.05, -0.9]} size={[3.9, 0.08, 1.4]} color={CONCRETE} />;
    case 'sheepfold':
      return <MetalGate x={0} z={3.3} width={1.3} height={1.1} />;
    case 'corral':
      return <MetalGate x={0} z={3.3} width={1.9} height={1.4} />;
    case 'stable':
      // Weather vane on the ridge.
      return (
        <group position={[0, 4.8, -0.5]}>
          <Block position={[0, 0.4, 0]} size={[0.05, 0.8, 0.05]} color={METAL_DARK} />
          <Block position={[0, 0.75, 0]} size={[0.7, 0.08, 0.03]} color={METAL_DARK} rotation={[0, 0.6, 0]} />
        </group>
      );
    default:
      return null;
  }
}

/** Level 3: a comfort detail per shelter. */
function Comfortable({ type }: { type: StructureId }) {
  switch (type) {
    case 'chickenCoop':
      // Nest boxes on the back of the hut.
      return <Block position={[-1.85, 0.95, -1.15]} size={[2.0, 0.5, 0.4]} color={WOOD} />;
    case 'pigsty':
      // Manure pit behind the shelter.
      return <Block position={[-2.05, 0.15, -1.55]} size={[2.2, 0.3, 0.35]} color="#4a3826" />;
    case 'sheepfold':
    case 'corral':
      // Straw bedding in front of the shed.
      return <Block position={[-1.5, 0.04, -0.2]} size={[3.0, 0.06, 1.0]} color={HAY} shadow={false} />;
    case 'stable':
      return <Block position={[2.9, 1.35, 2.6]} size={[1.0, 0.8, 0.7]} color={HAY} rotation={[0, -0.2, 0]} />;
    default:
      return null;
  }
}

/** Extra pieces for a shelter's level (nothing at level 1 or for other structures). */
export function ShelterUpgrades({ type, level }: { type: StructureId; level: ShelterLevel }) {
  const def = STRUCTURES[type];
  if (!def.shelter || level < 2) return null;
  // Lantern at the front-left corner, just outside the footprint.
  const frontZ = (def.depth * TILE_METERS) / 2 + 0.35;
  const leftX = -(def.width * TILE_METERS) / 2 + 0.35;
  return (
    <Meters>
      <Reinforced type={type} />
      {level >= 3 && (
        <>
          <Comfortable type={type} />
          <Lantern x={leftX} z={frontZ} />
        </>
      )}
    </Meters>
  );
}
