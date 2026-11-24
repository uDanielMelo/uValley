import { DOCK_LEVELS, type DockLevel } from '../../data/docks';
import { TILE_METERS } from '../../data/scale';
import { LAMP_MATERIAL } from '../materials';
import { Block, Meters } from './Buildings';

const CONCRETE = '#b9b4a8';
const CONCRETE_DARK = '#9a958a';
const DECK = '#a77a4a';
const WOOD = '#9c6b3c';
const WOOD_DARK = '#7a5230';
const RUBBER = '#2f2f33';
const HAZARD = '#e9c03a';
const ROOF = '#7d8a91';
const POST = '#6d6f72';
const SACK = '#d8c08e';

/** Height of the loading deck: a pickup's bed, so crates slide straight across. */
const DECK_H = 1.0;
const DECK_W = 3.2;
const DECK_D = 2.4;
/** Front edge of the deck, right at the bay (the footprint is 3.5 m; +z faces the road). */
const DECK_FRONT = 1.7;
const DECK_Z = DECK_FRONT - DECK_D / 2;
const ROOF_H = 3.3;

/**
 * Loading dock (1×1 tile = 3.5 m): a raised concrete deck with wooden boards, rubber bumpers and a
 * yellow edge facing the bay, steps at the back, a lean-to roof on steel posts and a few crates
 * waiting to go. Authored in meters; origin = footprint center, front faces +z.
 */
export function Dock() {
  return (
    <Meters>
      <Block position={[0, 0.05, 0]} size={[3.4, 0.1, 3.4]} color={CONCRETE_DARK} />
      {/* Deck: concrete body, boards on top, hazard edge and bumpers toward the vehicle */}
      <Block position={[0, DECK_H / 2, DECK_Z]} size={[DECK_W, DECK_H, DECK_D]} color={CONCRETE} />
      <Block position={[0, DECK_H + 0.03, DECK_Z]} size={[DECK_W - 0.06, 0.06, DECK_D - 0.06]} color={DECK} />
      <Block position={[0, DECK_H + 0.035, DECK_FRONT - 0.08]} size={[DECK_W, 0.07, 0.16]} color={HAZARD} shadow={false} />
      {[-1.0, 1.0].map((x) => (
        <Block key={x} position={[x, DECK_H - 0.3, DECK_FRONT + 0.06]} size={[0.35, 0.4, 0.12]} color={RUBBER} />
      ))}
      {/* Steps down at the back left */}
      {[0, 1, 2].map((i) => (
        <Block
          key={i}
          position={[-1.05, ((3 - i) * DECK_H) / 4 / 2, DECK_Z - DECK_D / 2 - 0.15 - i * 0.28]}
          size={[0.9, ((3 - i) * DECK_H) / 4, 0.3]}
          color={CONCRETE_DARK}
        />
      ))}
      {/* Steel posts and a lean-to roof sloping to the back */}
      {[-1.5, 1.5].flatMap((x) =>
        [DECK_Z - DECK_D / 2 + 0.1, DECK_FRONT - 0.15].map((z) => (
          <Block key={`${x},${z}`} position={[x, (DECK_H + ROOF_H) / 2, z]} size={[0.1, ROOF_H - DECK_H, 0.1]} color={POST} />
        )),
      )}
      <Block position={[0, ROOF_H + 0.08, DECK_Z + 0.2]} size={[3.6, 0.12, DECK_D + 0.9]} color={ROOF} rotation={[-0.1, 0, 0]} />
      {/* Sign board under the roof's front edge */}
      <Block position={[0, ROOF_H - 0.25, DECK_FRONT + 0.2]} size={[1.6, 0.4, 0.06]} color={HAZARD} shadow={false} />
      <Block position={[0, ROOF_H - 0.25, DECK_FRONT + 0.235]} size={[1.3, 0.1, 0.02]} color={RUBBER} shadow={false} />
      {/* Crates and sacks waiting on the deck */}
      <Block position={[1.0, DECK_H + 0.36, DECK_Z - 0.45]} size={[0.7, 0.6, 0.6]} color={WOOD} />
      <Block position={[1.0, DECK_H + 0.9, DECK_Z - 0.45]} size={[0.55, 0.45, 0.5]} color={WOOD_DARK} />
      <Block position={[0.25, DECK_H + 0.3, DECK_Z - 0.6]} size={[0.6, 0.5, 0.55]} color={WOOD_DARK} />
      <Block position={[-0.8, DECK_H + 0.22, DECK_Z - 0.5]} size={[0.7, 0.35, 0.5]} color={SACK} rotation={[0, 0.3, 0]} />
    </Meters>
  );
}

const PAINT = '#efe9da';
const PAINT_TRUCK = '#e9c03a';
const STEEL = '#8e969b';
/** Paint sits just above the road surface (meters). */
const PAINT_Y = 0.08;
const LINE = 0.12;

/** A painted bay outline on the street: `along` tiles to the dock's right, one tile in front of it. */
function BayLines({ along, length, width, color }: { along: number; length: number; width: number; color: string }) {
  const x = along * TILE_METERS;
  const z = TILE_METERS;
  const sides: Array<[number, number, number, number]> = [
    [x, z - width / 2, length, LINE],
    [x, z + width / 2, length, LINE],
    [x - length / 2, z, LINE, width],
    [x + length / 2, z, LINE, width],
  ];
  return (
    <>
      {sides.map(([px, pz, sx, sz]) => (
        <mesh key={`${px},${pz}`} position={[px, PAINT_Y, pz]} raycast={noRaycast}>
          <boxGeometry args={[sx, 0.01, sz]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      ))}
    </>
  );
}

const noRaycast = () => null;

/**
 * What each dock level adds: painted bays on the street (white for cars, yellow for the truck),
 * stacked pallets and a second sign at level 2, a steel dock leveler and a floodlight at level 3.
 */
export function DockUpgrades({ level }: { level: DockLevel }) {
  const bays = DOCK_LEVELS[level].bays;
  return (
    <Meters>
      {bays.map((bay) => (
        <BayLines
          key={bay.along}
          along={bay.along}
          length={bay.size === 'truck' ? 8 : 5.8}
          width={2.7}
          color={bay.size === 'truck' ? PAINT_TRUCK : PAINT}
        />
      ))}
      {level >= 2 && (
        <>
          <Block position={[1.45, 0.12, DECK_Z - DECK_D / 2 - 0.4]} size={[0.9, 0.24, 0.7]} color={WOOD_DARK} />
          <Block position={[1.45, 0.45, DECK_Z - DECK_D / 2 - 0.4]} size={[0.8, 0.4, 0.6]} color={WOOD} />
          <Block position={[-0.9, ROOF_H - 0.25, DECK_FRONT + 0.2]} size={[0.5, 0.4, 0.06]} color={PAINT} shadow={false} />
        </>
      )}
      {level >= 3 && (
        <>
          {/* Steel leveler plate bridging the deck to a truck bed */}
          <Block position={[0, DECK_H - 0.02, DECK_FRONT + 0.25]} size={[1.6, 0.05, 0.5]} color={STEEL} rotation={[0.15, 0, 0]} />
          {/* Floodlight on a pole at the street corner */}
          <Block position={[1.6, 2.2, DECK_FRONT + 0.05]} size={[0.12, 4.4, 0.12]} color={POST} />
          <mesh position={[1.6, 4.35, DECK_FRONT + 0.3]} material={LAMP_MATERIAL}>
            <boxGeometry args={[0.45, 0.2, 0.3]} />
          </mesh>
        </>
      )}
    </Meters>
  );
}
