import { useMemo, type ReactNode } from 'react';
import { DoubleSide, ExtrudeGeometry, Shape } from 'three';
import { METER_SCALE } from '../../data/scale';
import { WINDOW_MATERIAL } from '../materials';

type Vec3 = [number, number, number];

/**
 * Procedural low-poly farm buildings, authored in METERS (see data/scale.ts) and scaled to
 * world units by <Meters>. Origin = footprint center, y = 0 on the ground, front faces +z.
 */

export function Meters({ children }: { children: ReactNode }) {
  return <group scale={METER_SCALE}>{children}</group>;
}

interface BlockProps {
  position: Vec3;
  size: Vec3;
  color: string;
  rotation?: Vec3;
  shadow?: boolean;
}

export function Block({ position, size, color, rotation, shadow = true }: BlockProps) {
  return (
    <mesh position={position} rotation={rotation} castShadow={shadow} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} flatShading roughness={0.85} />
    </mesh>
  );
}

export function Glass({ position, size }: { position: Vec3; size: Vec3 }) {
  return (
    <mesh position={position} material={WINDOW_MATERIAL}>
      <boxGeometry args={size} />
    </mesh>
  );
}

interface RoofProps {
  /** Along the ridge (x). */
  length: number;
  /** Across the ridge (z). */
  span: number;
  rise: number;
  /** Height of the eaves. */
  base: number;
  color: string;
  position?: [number, number];
}

/** Triangular-prism roof: ridge along x, sitting on y = base, centered at position [x, z]. */
export function GableRoof({ length, span, rise, base, color, position = [0, 0] }: RoofProps) {
  const geometry = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-span / 2, 0);
    shape.lineTo(span / 2, 0);
    shape.lineTo(0, rise);
    shape.closePath();
    const g = new ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
    g.translate(0, 0, -length / 2);
    g.rotateY(-Math.PI / 2);
    return g;
  }, [length, span, rise]);
  return (
    <mesh geometry={geometry} position={[position[0], base, position[1]]} castShadow receiveShadow>
      <meshStandardMaterial color={color} flatShading roughness={0.8} />
    </mesh>
  );
}

/** Thin see-through wire mesh panel (chicken wire). */
export function WirePanel({ position, size, rotationY = 0 }: { position: Vec3; size: [number, number]; rotationY?: number }) {
  return (
    <mesh position={position} rotation={[0, rotationY, 0]}>
      <planeGeometry args={size} />
      <meshStandardMaterial color="#c9cdc8" transparent opacity={0.28} side={DoubleSide} depthWrite={false} />
    </mesh>
  );
}

export const WHITE = '#f4efe4';
export const WOOD = '#9c6b3c';
export const WOOD_DARK = '#6e4a2a';
export const CONCRETE = '#a29b8c';
export const HAY = '#d9b45a';

// ---------- Chicken coop: 2×1 tiles = 7 × 3.5 m ----------

const COOP_WALL = '#e7c98f';
const COOP_ROOF = '#b5523b';
/** Hut: 2.6 × 2.0 m, raised 0.5 m, eaves at 2.0 m. */
const HUT_X = -1.85;
const HUT_W = 2.6;
const HUT_D = 2.0;
const HUT_FLOOR = 0.5;
const HUT_TOP = 2.0;
/** Run: fenced yard on the right, 1.2 m high. */
const RUN_X0 = HUT_X + HUT_W / 2;
const RUN_X1 = 3.35;
const RUN_Z = 1.5;
const RUN_H = 1.2;

/** Chicken coop: raised hut (human door, 45 cm pop hole with a ramp) and a wire-fenced run. */
export function ChickenCoop() {
  const runW = RUN_X1 - RUN_X0;
  const runCx = (RUN_X0 + RUN_X1) / 2;
  const hutRight = HUT_X + HUT_W / 2;
  return (
    <Meters>
      {/* Hut on legs */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Block
            key={`${sx}${sz}`}
            position={[HUT_X + sx * (HUT_W / 2 - 0.1), HUT_FLOOR / 2, sz * (HUT_D / 2 - 0.1)]}
            size={[0.12, HUT_FLOOR, 0.12]}
            color={WOOD_DARK}
          />
        )),
      )}
      <Block
        position={[HUT_X, (HUT_FLOOR + HUT_TOP) / 2, 0]}
        size={[HUT_W, HUT_TOP - HUT_FLOOR, HUT_D]}
        color={COOP_WALL}
      />
      <GableRoof length={HUT_W + 0.4} span={HUT_D + 0.5} rise={0.8} base={HUT_TOP} color={COOP_ROOF} position={[HUT_X, 0]} />
      {/* Human door (front) with a step, and a small window */}
      <Block position={[HUT_X - 0.5, HUT_FLOOR + 0.62, HUT_D / 2 + 0.02]} size={[0.7, 1.24, 0.05]} color={WOOD_DARK} />
      <Block position={[HUT_X - 0.5, 0.25, HUT_D / 2 + 0.25]} size={[0.8, 0.08, 0.4]} color={WOOD} />
      <Glass position={[HUT_X + 0.6, 1.45, HUT_D / 2 + 0.02]} size={[0.5, 0.4, 0.04]} />
      {/* Pop hole on the run side, with a ramp down to the ground */}
      <Block position={[hutRight + 0.02, HUT_FLOOR + 0.23, 0]} size={[0.05, 0.45, 0.4]} color="#3a2a1c" shadow={false} />
      <Block
        position={[hutRight + 0.5, HUT_FLOOR / 2, 0]}
        size={[1.12, 0.04, 0.4]}
        color={WOOD}
        rotation={[0, 0, -Math.atan2(HUT_FLOOR, 1)]}
      />
      {/* Run: posts, top and bottom rails, wire mesh, gate */}
      {[RUN_X0 + 0.05, runCx, RUN_X1].flatMap((x) =>
        [-RUN_Z, RUN_Z].map((z) => (
          <Block key={`${x}${z}`} position={[x, RUN_H / 2, z]} size={[0.1, RUN_H, 0.1]} color={WOOD} />
        )),
      )}
      {[0.08, RUN_H].flatMap((y) => [
        <Block key={`f${y}`} position={[runCx, y, RUN_Z]} size={[runW, 0.07, 0.07]} color={WOOD} />,
        <Block key={`b${y}`} position={[runCx, y, -RUN_Z]} size={[runW, 0.07, 0.07]} color={WOOD} />,
        <Block key={`s${y}`} position={[RUN_X1, y, 0]} size={[0.07, 0.07, RUN_Z * 2]} color={WOOD} />,
      ])}
      <WirePanel position={[runCx, RUN_H / 2, RUN_Z]} size={[runW, RUN_H]} />
      <WirePanel position={[runCx, RUN_H / 2, -RUN_Z]} size={[runW, RUN_H]} />
      <WirePanel position={[RUN_X1, RUN_H / 2, 0]} size={[RUN_Z * 2, RUN_H]} rotationY={Math.PI / 2} />
      <Block position={[runCx + 0.9, 0.6, RUN_Z + 0.02]} size={[0.9, 1.0, 0.04]} color={WOOD_DARK} />
      {/* Feeder and water trough in the run */}
      <Block position={[runCx + 0.4, 0.1, -0.7]} size={[1.0, 0.2, 0.3]} color={WOOD} />
      <mesh position={[runCx - 0.4, 0.15, 0.8]} castShadow>
        <cylinderGeometry args={[0.18, 0.22, 0.3, 8]} />
        <meshStandardMaterial color="#9aa3a8" flatShading />
      </mesh>
    </Meters>
  );
}

// ---------- Silo: 2×2 tiles = 7 × 7 m; Ø 5 m, 12 m tall ----------

const SILO_BODY = '#c9ced3';
const SILO_BAND = '#8f969d';
const SILO_DOME = '#7e8f9e';
const SILO_R = 2.5;
const SILO_H = 12;
const SILO_BASE = 0.2;

/** Silo: corrugated metal cylinder with bands, a conical roof and a ladder. */
export function Silo() {
  const rungs = Math.floor((SILO_H - 0.4) / 0.4);
  return (
    <Meters>
      <Block position={[0, SILO_BASE / 2, 0]} size={[6.4, SILO_BASE, 6.4]} color={CONCRETE} />
      <mesh position={[0, SILO_BASE + SILO_H / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[SILO_R, SILO_R, SILO_H, 16]} />
        <meshStandardMaterial color={SILO_BODY} flatShading roughness={0.5} metalness={0.2} />
      </mesh>
      {[3, 6, 9].map((y) => (
        <mesh key={y} position={[0, SILO_BASE + y, 0]}>
          <cylinderGeometry args={[SILO_R + 0.06, SILO_R + 0.06, 0.2, 16]} />
          <meshStandardMaterial color={SILO_BAND} flatShading />
        </mesh>
      ))}
      <mesh position={[0, SILO_BASE + SILO_H + 0.8, 0]} castShadow>
        <coneGeometry args={[SILO_R + 0.15, 1.6, 16]} />
        <meshStandardMaterial color={SILO_DOME} flatShading roughness={0.5} metalness={0.2} />
      </mesh>
      {/* Ladder: 45 cm wide, rungs every 40 cm */}
      {[-0.22, 0.22].map((x) => (
        <Block key={x} position={[x, SILO_BASE + SILO_H / 2, SILO_R + 0.15]} size={[0.06, SILO_H, 0.06]} color={SILO_BAND} shadow={false} />
      ))}
      {Array.from({ length: rungs }, (_, i) => (
        <Block key={i} position={[0, SILO_BASE + 0.4 + i * 0.4, SILO_R + 0.15]} size={[0.44, 0.04, 0.04]} color={SILO_BAND} shadow={false} />
      ))}
    </Meters>
  );
}

// ---------- Warehouse: 3×2 tiles = 10.5 × 7 m; walls 4.5 m ----------

const SHED_WALL = '#8fa3b0';
const SHED_TRIM = '#5f707c';
const SHED_ROOF = '#55636d';
const SHED_W = 9.6;
const SHED_D = 5.2;
const SHED_Z = -0.6;
const SHED_H = 4.5;
const SHED_FRONT = SHED_Z + SHED_D / 2;
const ROLLER_W = 3.6;
const ROLLER_H = 3.6;
const ROLLER_X = -2;

/** Warehouse: metal shed with a 3.6 m roller door, windows and crates out front. */
export function Warehouse() {
  return (
    <Meters>
      <Block position={[0, 0.1, 0]} size={[10.2, 0.2, 6.8]} color={CONCRETE} />
      <Block position={[0, SHED_H / 2, SHED_Z]} size={[SHED_W, SHED_H, SHED_D]} color={SHED_WALL} />
      <GableRoof length={SHED_W + 0.5} span={SHED_D + 0.6} rise={1.3} base={SHED_H} color={SHED_ROOF} position={[0, SHED_Z]} />
      {/* Roller door with slats */}
      <Block position={[ROLLER_X, ROLLER_H / 2 + 0.2, SHED_FRONT + 0.04]} size={[ROLLER_W, ROLLER_H, 0.08]} color={SHED_TRIM} />
      {Array.from({ length: 9 }, (_, i) => (
        <Block
          key={i}
          position={[ROLLER_X, 0.6 + i * 0.38, SHED_FRONT + 0.09]}
          size={[ROLLER_W - 0.05, 0.05, 0.03]}
          color={SHED_WALL}
          shadow={false}
        />
      ))}
      {/* Person door and windows */}
      <Block position={[1.2, 1.05 + 0.2, SHED_FRONT + 0.04]} size={[0.9, 2.1, 0.06]} color={SHED_TRIM} />
      <Glass position={[3.3, 3.0, SHED_FRONT + 0.04]} size={[2.2, 0.8, 0.06]} />
      <Glass position={[-SHED_W / 2 - 0.04, 3.0, SHED_Z]} size={[0.06, 0.8, 2.4]} />
      <Glass position={[SHED_W / 2 + 0.04, 3.0, SHED_Z]} size={[0.06, 0.8, 2.4]} />
      {/* Crates (≈1 m) and a pallet */}
      <Block position={[2.8, 0.7, 2.75]} size={[1.0, 1.0, 1.0]} color={WOOD} />
      <Block position={[3.9, 0.6, 2.6]} size={[0.8, 0.8, 0.8]} color={WOOD_DARK} />
      <Block position={[2.8, 1.6, 2.75]} size={[0.8, 0.8, 0.8]} color={WOOD_DARK} />
      <Block position={[ROLLER_X, 0.28, 2.75]} size={[1.2, 0.15, 1.0]} color={WOOD} />
    </Meters>
  );
}

// ---------- Barn: 3×3 tiles = 10.5 × 10.5 m; walls 4.8 m, ridge 8.2 m ----------

const BARN_RED = '#b23a2e';
const BARN_ROOF = '#5b4a42';
const BARN_W = 9;
const BARN_D = 8.6;
const BARN_Z = -0.6;
const BARN_H = 4.8;
const BARN_FRONT = BARN_Z + BARN_D / 2;
const DOOR_W = 1.9;
const DOOR_H = 3.6;
const BRACE = Math.atan2(DOOR_H, DOOR_W);
const BRACE_LEN = Math.hypot(DOOR_W, DOOR_H) - 0.1;

/** Barn: classic red barn with white trim, two 3.6 m sliding doors, a hay loft and bales. */
export function Barn() {
  return (
    <Meters>
      <Block position={[0, 0.1, BARN_Z]} size={[BARN_W + 0.4, 0.2, BARN_D + 0.4]} color={CONCRETE} />
      <Block position={[0, BARN_H / 2, BARN_Z]} size={[BARN_W, BARN_H, BARN_D]} color={BARN_RED} />
      <GableRoof length={BARN_W + 0.6} span={BARN_D + 0.8} rise={3.4} base={BARN_H} color={BARN_ROOF} position={[0, BARN_Z]} />
      {/* Eave trim */}
      <Block position={[0, BARN_H, BARN_FRONT + 0.05]} size={[BARN_W + 0.1, 0.2, 0.1]} color={WHITE} shadow={false} />
      {/* Doors with white X braces */}
      {[-DOOR_W / 2 - 0.02, DOOR_W / 2 + 0.02].map((x) => (
        <group key={x} position={[x, DOOR_H / 2 + 0.2, BARN_FRONT + 0.06]}>
          <Block position={[0, 0, 0]} size={[DOOR_W, DOOR_H, 0.1]} color={BARN_RED} />
          {[DOOR_H / 2 - 0.08, -DOOR_H / 2 + 0.08, 0].map((y) => (
            <Block key={y} position={[0, y, 0.07]} size={[DOOR_W, 0.15, 0.04]} color={WHITE} shadow={false} />
          ))}
          <Block position={[0, 0, 0.07]} size={[BRACE_LEN, 0.14, 0.04]} color={WHITE} rotation={[0, 0, BRACE]} shadow={false} />
          <Block position={[0, 0, 0.07]} size={[BRACE_LEN, 0.14, 0.04]} color={WHITE} rotation={[0, 0, -BRACE]} shadow={false} />
        </group>
      ))}
      <Block position={[0, DOOR_H + 0.3, BARN_FRONT + 0.06]} size={[DOOR_W * 2 + 0.4, 0.2, 0.1]} color={WHITE} shadow={false} />
      {/* Hay loft door in the gable */}
      <Block position={[0, BARN_H + 1.1, BARN_FRONT + 0.05]} size={[1.7, 1.5, 0.1]} color={WHITE} />
      <Block position={[0, BARN_H + 1.1, BARN_FRONT + 0.1]} size={[1.4, 1.2, 0.04]} color={HAY} shadow={false} />
      {/* Side windows */}
      {[-1, 1].flatMap((side) =>
        [-2.2, 1.4].map((z) => (
          <Glass key={`${side}${z}`} position={[side * (BARN_W / 2 + 0.04), 2.6, BARN_Z + z]} size={[0.06, 0.9, 1.1]} />
        )),
      )}
      {/* Hay bales (1.2 × 0.8 × 0.9 m) */}
      <Block position={[3.6, 0.45, 4.4]} size={[1.2, 0.9, 0.8]} color={HAY} />
      <Block position={[3.0, 0.45, 4.6]} size={[0.8, 0.9, 1.2]} color={HAY} rotation={[0, 0.5, 0]} />
      <Block position={[3.4, 1.35, 4.45]} size={[1.2, 0.9, 0.8]} color={HAY} rotation={[0, 0.2, 0]} />
    </Meters>
  );
}

// ---------- Bunkhouse: 2×1 tiles = 7 × 3.5 m ----------

const BUNK_WALL = '#b88a5a';
const BUNK_TRIM = '#efe6d2';
const BUNK_ROOF = '#5d6a78';
/** Cabin: 6.2 × 2.7 m on a 25 cm concrete base, eaves at 2.75 m. */
const BUNK_W = 6.2;
const BUNK_D = 2.7;
const BUNK_BASE = 0.25;
const BUNK_TOP = 2.75;

/** Workers' bunkhouse: plank cabin with a front door, three windows and a stove pipe. */
export function Bunkhouse() {
  const front = BUNK_D / 2;
  const wallH = BUNK_TOP - BUNK_BASE;
  return (
    <Meters>
      <Block position={[0, BUNK_BASE / 2, 0]} size={[BUNK_W + 0.3, BUNK_BASE, BUNK_D + 0.3]} color={CONCRETE} />
      <Block position={[0, BUNK_BASE + wallH / 2, 0]} size={[BUNK_W, wallH, BUNK_D]} color={BUNK_WALL} />
      {/* Plank seams on the front and back walls */}
      {[0.8, 1.4, 2.0].flatMap((y) =>
        [-1, 1].map((side) => (
          <Block
            key={`${y}${side}`}
            position={[0, BUNK_BASE + y, side * (front + 0.01)]}
            size={[BUNK_W, 0.03, 0.02]}
            color={WOOD_DARK}
            shadow={false}
          />
        )),
      )}
      {/* Corner trims */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Block
            key={`c${sx}${sz}`}
            position={[sx * (BUNK_W / 2), BUNK_BASE + wallH / 2, sz * front]}
            size={[0.12, wallH, 0.12]}
            color={BUNK_TRIM}
            shadow={false}
          />
        )),
      )}
      <GableRoof length={BUNK_W + 0.6} span={BUNK_D + 0.7} rise={1.2} base={BUNK_TOP} color={BUNK_ROOF} />
      {/* Door (0.9 × 2.1 m) with frame and a step */}
      <Block position={[-1.9, BUNK_BASE + 1.1, front + 0.03]} size={[1.08, 2.24, 0.04]} color={BUNK_TRIM} shadow={false} />
      <Block position={[-1.9, BUNK_BASE + 1.05, front + 0.05]} size={[0.9, 2.1, 0.04]} color={WOOD_DARK} />
      <Block position={[-1.65, BUNK_BASE + 1.0, front + 0.09]} size={[0.06, 0.06, 0.04]} color="#d8b84a" shadow={false} />
      <Block position={[-1.9, 0.08, front + 0.45]} size={[1.2, 0.16, 0.5]} color={CONCRETE} />
      {/* Windows (0.9 × 0.8 m) with white frames */}
      {[-0.4, 1.0, 2.3].map((x) => (
        <group key={x}>
          <Block position={[x, BUNK_BASE + 1.6, front + 0.02]} size={[1.0, 0.9, 0.04]} color={BUNK_TRIM} shadow={false} />
          <Glass position={[x, BUNK_BASE + 1.6, front + 0.05]} size={[0.86, 0.76, 0.03]} />
          <Block position={[x, BUNK_BASE + 1.12, front + 0.08]} size={[1.06, 0.06, 0.12]} color={BUNK_TRIM} shadow={false} />
        </group>
      ))}
      {/* Side window */}
      <Glass position={[BUNK_W / 2 + 0.02, BUNK_BASE + 1.6, 0]} size={[0.03, 0.7, 0.8]} />
      {/* Wood stove pipe */}
      <mesh position={[1.6, BUNK_TOP + 1.1, -0.5]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 1.4, 8]} />
        <meshStandardMaterial color="#555b60" flatShading metalness={0.3} roughness={0.6} />
      </mesh>
    </Meters>
  );
}
