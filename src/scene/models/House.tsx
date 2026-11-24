import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { PointLight } from 'three';
import { LAMP_MATERIAL, nightState } from '../materials';
import { Block, GableRoof, Glass, HAY, Meters, WOOD, WOOD_DARK } from './Buildings';

type Vec3 = [number, number, number];

/**
 * The ranch lodge: a big two-storey log house with a wide covered porch, a stone chimney and a
 * cross gable over the entrance. Footprint 4 × 2 tiles = 14 × 7 m (see `STRUCTURES.house`),
 * origin = footprint center, y = 0 on the ground, the porch faces +z. It sleeps `HOUSE_BEDS`
 * people, so it is the starting home of the farm.
 */

const LOG = '#7b5233';
const LOG_ALT = '#6a4527';
const LOG_END = '#a37548';
const GABLE = '#6f4a2c';
const ROOF = '#3e4944';
const ROOF_RIDGE = '#2f3834';
const STONE = '#8f887a';
const STONE_ALT = '#7d7669';
const STONE_DARK = '#6a645a';
const TRIM = '#3b2a1d';
const SHUTTER = '#2f4a3a';
const DECK = '#8a6038';
const FLOWER_RED = '#d94b3a';
const FLOWER_YELLOW = '#f0c34a';
const LEAF = '#4f8a35';
const IRON = '#2a2724';

// ----- main body -----
const HALF_W = 6.1;
const BACK_Z = -3.0;
const FRONT_Z = 1.7;
const BODY_D = FRONT_Z - BACK_Z;
const MID_Z = (FRONT_Z + BACK_Z) / 2;
const PLINTH = 0.5;
const WALL_TOP = 3.2;
const LAYER = 0.3;
const LAYERS = Math.round((WALL_TOP - PLINTH) / LAYER);
const PITCH = 0.75;
const TAN = Math.tan(PITCH);
const COS = Math.cos(PITCH);
const DECK_TOP = 0.45;
const PORCH_FRONT = 3.2;

interface SlabProps {
  /** Distance from the ridge to the outer eave, along the floor. */
  half: number;
  /** Length of the slab along the ridge. */
  length: number;
  baseY: number;
  overhang: number;
  /** Ridge direction. */
  along: 'x' | 'z';
  center: [number, number];
  color: string;
}

/** Both slopes of a gabled roof (the infill under it is a separate prism). */
function RoofSlabs({ half, length, baseY, overhang, along, center, color }: SlabProps) {
  const slab = half / COS + 0.05;
  const rise = half * TAN;
  const y = baseY - overhang * TAN + rise / 2 + 0.05;
  const off = half / 2;
  return (
    <>
      {[-1, 1].map((s) =>
        along === 'x' ? (
          <Block
            key={s}
            position={[center[0], y, center[1] + s * off]}
            size={[length, 0.1, slab]}
            rotation={[s * PITCH, 0, 0]}
            color={color}
          />
        ) : (
          <Block
            key={s}
            position={[center[0] + s * off, y, center[1]]}
            size={[slab, 0.1, length]}
            rotation={[0, 0, -s * PITCH]}
            color={color}
          />
        ),
      )}
    </>
  );
}

/** A framed window on a wall facing +z (rotate the group for the other walls). */
function Window({
  position,
  rotationY = 0,
  w = 1.0,
  h = 1.3,
  shutters = false,
  flowers = false,
}: {
  position: Vec3;
  rotationY?: number;
  w?: number;
  h?: number;
  shutters?: boolean;
  flowers?: boolean;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Block position={[0, 0, 0.04]} size={[w + 0.2, h + 0.2, 0.08]} color={TRIM} shadow={false} />
      <Glass position={[0, 0, 0.09]} size={[w, h, 0.03]} />
      <Block position={[0, 0, 0.12]} size={[0.05, h, 0.03]} color={TRIM} shadow={false} />
      <Block position={[0, 0, 0.12]} size={[w, 0.05, 0.03]} color={TRIM} shadow={false} />
      <Block position={[0, -h / 2 - 0.14, 0.12]} size={[w + 0.34, 0.07, 0.24]} color={TRIM} />
      {shutters &&
        [-1, 1].map((s) => (
          <Block key={s} position={[s * (w / 2 + 0.42), 0, 0.07]} size={[0.38, h + 0.1, 0.05]} color={SHUTTER} shadow={false} />
        ))}
      {flowers && (
        <group position={[0, -h / 2 - 0.34, 0.2]}>
          <Block position={[0, 0, 0]} size={[w + 0.1, 0.2, 0.22]} color={WOOD} shadow={false} />
          <Block position={[0, 0.13, 0]} size={[w, 0.07, 0.17]} color={LEAF} shadow={false} />
          {[-0.36, -0.12, 0.12, 0.36].map((x, i) => (
            <Block key={x} position={[x * (w / 0.9), 0.2, 0]} size={[0.1, 0.1, 0.1]} color={i % 2 ? FLOWER_YELLOW : FLOWER_RED} shadow={false} />
          ))}
        </group>
      )}
    </group>
  );
}

/** Small gabled dormer window poking out of the front roof. */
function Dormer({ x }: { x: number }) {
  const zFront = 0.9;
  return (
    <group position={[x, 0, 0]}>
      <Block position={[0, 4.0, zFront - 0.6]} size={[1.5, 1.0, 1.2]} color={GABLE} />
      <Window position={[0, 4.0, zFront]} w={0.7} h={0.6} />
      {[-1, 1].map((s) => (
        <Block
          key={s}
          position={[s * 0.4, 4.7, zFront - 0.75]}
          size={[1.0, 0.07, 1.6]}
          rotation={[0, 0, -s * 0.5]}
          color={ROOF}
        />
      ))}
    </group>
  );
}

function StoneChimney({ x, z, height, w, d }: { x: number; z: number; height: number; w: number; d: number }) {
  const courses = Math.round(height / 0.4);
  return (
    <group position={[x, 0, z]}>
      {Array.from({ length: courses }, (_, i) => (
        <Block
          key={i}
          position={[0, 0.2 + i * 0.4, 0]}
          size={[w - (i > courses - 3 ? 0.2 : 0) + (i % 2 ? 0.04 : 0), 0.4, d - (i > courses - 3 ? 0.2 : 0) + (i % 3 ? 0 : 0.04)]}
          color={i % 3 === 0 ? STONE_DARK : i % 3 === 1 ? STONE : STONE_ALT}
        />
      ))}
      <Block position={[0, height + 0.08, 0]} size={[w + 0.1, 0.16, d + 0.1]} color={STONE_DARK} />
      <Block position={[0, height + 0.18, 0]} size={[w - 0.45, 0.1, d - 0.45]} color={IRON} shadow={false} />
    </group>
  );
}

function RockingChair({ x, z, rotY = 0 }: { x: number; z: number; rotY?: number }) {
  const y = DECK_TOP;
  return (
    <group position={[x, y, z]} rotation={[0, rotY, 0]}>
      {[-0.26, 0.26].map((s) => (
        <group key={s}>
          <Block position={[s, 0.04, 0]} size={[0.05, 0.05, 0.8]} color={WOOD_DARK} shadow={false} />
          <Block position={[s, 0.3, 0.2]} size={[0.05, 0.5, 0.05]} color={WOOD_DARK} shadow={false} />
          <Block position={[s, 0.3, -0.2]} size={[0.05, 0.5, 0.05]} color={WOOD_DARK} shadow={false} />
          <Block position={[s, 0.5, -0.05]} size={[0.06, 0.05, 0.5]} color={WOOD_DARK} shadow={false} />
        </group>
      ))}
      <Block position={[0, 0.5, 0.05]} size={[0.56, 0.06, 0.5]} color={WOOD} />
      <Block position={[0, 0.82, -0.2]} size={[0.56, 0.6, 0.05]} color={WOOD} rotation={[-0.15, 0, 0]} />
    </group>
  );
}

function Barrel({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, DECK_TOP + 0.45, z]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.36, 0.32, 0.9, 8]} />
        <meshStandardMaterial color="#7a5430" flatShading roughness={0.9} />
      </mesh>
      {[-0.28, 0.28].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.375, 0.375, 0.05, 8]} />
          <meshStandardMaterial color={IRON} flatShading roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function WagonWheel({ position, rotationY = 0 }: { position: Vec3; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh rotation={[0, 0, 0]} castShadow>
        <torusGeometry args={[0.55, 0.06, 4, 12]} />
        <meshStandardMaterial color={WOOD_DARK} flatShading roughness={0.9} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <Block key={i} position={[0, 0, 0]} size={[1.08, 0.05, 0.05]} color={WOOD} rotation={[0, 0, (i * Math.PI) / 4]} shadow={false} />
      ))}
      <Block position={[0, 0, 0]} size={[0.14, 0.14, 0.12]} color={IRON} shadow={false} />
    </group>
  );
}

/** Lantern: a warm lamp on a post, with a light that fades in at night. */
function Lantern({ position, light = false }: { position: Vec3; light?: boolean }) {
  const ref = useRef<PointLight>(null);
  useFrame(() => {
    if (ref.current) ref.current.intensity = nightState.value > 0.4 ? (nightState.value - 0.4) * 6 : 0;
  });
  return (
    <group position={position}>
      <Block position={[0, 0.28, 0]} size={[0.04, 0.22, 0.04]} color={IRON} shadow={false} />
      <mesh position={[0, 0, 0]} material={LAMP_MATERIAL}>
        <boxGeometry args={[0.2, 0.28, 0.2]} />
      </mesh>
      <Block position={[0, 0.17, 0]} size={[0.26, 0.05, 0.26]} color={IRON} shadow={false} />
      <Block position={[0, -0.17, 0]} size={[0.24, 0.04, 0.24]} color={IRON} shadow={false} />
      {light && <pointLight ref={ref} position={[0, -0.1, 0.6]} color="#ffbf6b" distance={9} decay={2} intensity={0} />}
    </group>
  );
}

/** Antlers over the door. */
function Antlers({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <Block position={[0, 0, 0]} size={[0.3, 0.2, 0.1]} color={LOG_END} shadow={false} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Block position={[s * 0.38, 0.22, 0]} size={[0.7, 0.06, 0.06]} color="#e4d8be" rotation={[0, 0, s * 0.5]} shadow={false} />
          <Block position={[s * 0.72, 0.5, 0]} size={[0.4, 0.05, 0.05]} color="#e4d8be" rotation={[0, 0, -s * 0.9]} shadow={false} />
          <Block position={[s * 0.55, 0.42, 0]} size={[0.05, 0.3, 0.05]} color="#e4d8be" shadow={false} />
        </group>
      ))}
    </group>
  );
}

/** Ranch brand plaque (a "U") on the entrance gable. */
function Brand({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <Block position={[0, 0, 0]} size={[1.3, 1.1, 0.08]} color={TRIM} shadow={false} />
      <Block position={[-0.3, 0.05, 0.06]} size={[0.16, 0.8, 0.05]} color={HAY} shadow={false} />
      <Block position={[0.3, 0.05, 0.06]} size={[0.16, 0.8, 0.05]} color={HAY} shadow={false} />
      <Block position={[0, -0.27, 0.06]} size={[0.76, 0.16, 0.05]} color={HAY} shadow={false} />
    </group>
  );
}

function PorchPost({ x, stone = false }: { x: number; stone?: boolean }) {
  const h = WALL_TOP - DECK_TOP;
  return (
    <group position={[x, 0, PORCH_FRONT - 0.15]}>
      {stone && <Block position={[0, DECK_TOP + 0.45, 0]} size={[0.56, 0.9, 0.56]} color={STONE} />}
      <Block
        position={[0, DECK_TOP + h / 2 + (stone ? 0.45 : 0), 0]}
        size={[stone ? 0.36 : 0.3, h - (stone ? 0.9 : 0), stone ? 0.36 : 0.3]}
        color={LOG_ALT}
      />
      {/* Bracket under the beam */}
      <Block position={[0, WALL_TOP - 0.35, 0]} size={[0.46, 0.1, 0.34]} color={LOG_END} shadow={false} />
    </group>
  );
}

function Rail({ x0, x1 }: { x0: number; x1: number }) {
  const cx = (x0 + x1) / 2;
  const len = x1 - x0;
  const n = Math.floor(len / 0.45);
  return (
    <group>
      <Block position={[cx, DECK_TOP + 0.95, PORCH_FRONT - 0.15]} size={[len, 0.1, 0.14]} color={WOOD} />
      <Block position={[cx, DECK_TOP + 0.3, PORCH_FRONT - 0.15]} size={[len, 0.08, 0.1]} color={WOOD} shadow={false} />
      {Array.from({ length: n }, (_, i) => (
        <Block
          key={i}
          position={[x0 + (i + 0.5) * (len / n), DECK_TOP + 0.6, PORCH_FRONT - 0.15]}
          size={[0.06, 0.62, 0.06]}
          color={WOOD}
          shadow={false}
        />
      ))}
    </group>
  );
}

/** Stacked firewood against the east wall. */
function Firewood({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {[0, 1, 2].map((row) =>
        Array.from({ length: 6 - row }, (_, i) => (
          <mesh key={`${row}-${i}`} position={[0, 0.14 + row * 0.26, -0.7 + i * 0.28 + row * 0.14]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.12, 0.12, 0.7, 6]} />
            <meshStandardMaterial color={(i + row) % 2 ? LOG_END : LOG} flatShading roughness={0.9} />
          </mesh>
        )),
      )}
    </group>
  );
}

export function House() {
  const porchRoofLen = PORCH_FRONT + 0.2 - FRONT_Z;
  const porchRoofTilt = Math.atan2(0.4, porchRoofLen);
  const crossHalf = 2.2;
  const crossRise = crossHalf * TAN;
  const crossZ0 = -0.2;
  const crossZ1 = PORCH_FRONT + 0.35;
  const crossLen = crossZ1 - crossZ0;

  return (
    <Meters>
      {/* ---- Stone plinth and log walls (alternating layers overhang at the corners) ---- */}
      <Block position={[0, PLINTH / 2, MID_Z]} size={[HALF_W * 2 + 0.3, PLINTH, BODY_D + 0.3]} color={STONE} />
      {Array.from({ length: LAYERS }, (_, i) => (
        <Block
          key={i}
          position={[0, PLINTH + LAYER / 2 + i * LAYER, MID_Z]}
          size={i % 2 ? [HALF_W * 2 + 0.28, LAYER - 0.01, BODY_D] : [HALF_W * 2, LAYER - 0.01, BODY_D + 0.28]}
          color={i % 2 ? LOG : LOG_ALT}
        />
      ))}
      {/* Log ends at the corners */}
      {[-1, 1].flatMap((sx) =>
        [FRONT_Z, BACK_Z].map((z) => (
          <Block key={`${sx}${z}`} position={[sx * HALF_W, PLINTH + (LAYERS * LAYER) / 2, z]} size={[0.3, LAYERS * LAYER, 0.3]} color={LOG_END} shadow={false} />
        )),
      )}
      {/* Upper-floor band under the eaves */}
      <Block position={[0, WALL_TOP + 0.04, MID_Z]} size={[HALF_W * 2 + 0.5, 0.1, BODY_D + 0.5]} color={TRIM} />

      {/* ---- Main roof ---- */}
      <GableRoof length={HALF_W * 2} span={BODY_D} rise={(BODY_D / 2) * TAN} base={WALL_TOP} color={GABLE} position={[0, MID_Z]} />
      <RoofSlabs half={BODY_D / 2 + 0.5} length={HALF_W * 2 + 0.7} baseY={WALL_TOP} overhang={0.5} along="x" center={[0, MID_Z]} color={ROOF} />
      <Block
        position={[0, WALL_TOP + (BODY_D / 2) * TAN + 0.1, MID_Z]}
        size={[HALF_W * 2 + 0.8, 0.12, 0.28]}
        color={ROOF_RIDGE}
      />

      {/* ---- Entrance cross gable ---- */}
      <group position={[0, 0, (crossZ0 + crossZ1) / 2 - 0.15]} rotation={[0, Math.PI / 2, 0]}>
        <GableRoof length={crossLen - 0.5} span={crossHalf * 2} rise={crossRise} base={WALL_TOP} color={GABLE} />
      </group>
      <RoofSlabs
        half={crossHalf + 0.3}
        length={crossLen}
        baseY={WALL_TOP}
        overhang={0.3}
        along="z"
        center={[0, (crossZ0 + crossZ1) / 2]}
        color={ROOF}
      />
      <Block position={[0, WALL_TOP + crossRise + 0.1, (crossZ0 + crossZ1) / 2]} size={[0.26, 0.12, crossLen + 0.1]} color={ROOF_RIDGE} />
      <Brand position={[0, WALL_TOP + 0.95, crossZ1 - 0.6]} />

      {/* ---- Dormers ---- */}
      <Dormer x={-4.3} />
      <Dormer x={4.3} />

      {/* ---- Chimneys ---- */}
      <StoneChimney x={-HALF_W - 0.45} z={MID_Z + 0.2} height={6.4} w={1.3} d={2.0} />
      <StoneChimney x={3.2} z={BACK_Z + 0.9} height={6.0} w={0.7} d={0.7} />

      {/* ---- Porch ---- */}
      <Block position={[0, DECK_TOP / 2, (FRONT_Z + PORCH_FRONT) / 2]} size={[HALF_W * 2 + 0.3, DECK_TOP, PORCH_FRONT - FRONT_Z + 0.15]} color={STONE_ALT} />
      <Block position={[0, DECK_TOP + 0.02, (FRONT_Z + PORCH_FRONT) / 2]} size={[HALF_W * 2 + 0.1, 0.05, PORCH_FRONT - FRONT_Z]} color={DECK} />
      {/* Steps */}
      <Block position={[0, 0.12, PORCH_FRONT + 0.15]} size={[3.0, 0.24, 0.3]} color={STONE} />
      <Block position={[0, 0.3, PORCH_FRONT - 0.1]} size={[3.0, 0.1, 0.3]} color={DECK} shadow={false} />
      {/* Beam, posts and railings */}
      <Block position={[0, WALL_TOP - 0.1, PORCH_FRONT - 0.15]} size={[HALF_W * 2 + 0.3, 0.3, 0.3]} color={LOG} />
      {[-5.8, -3.9, 3.9, 5.8].map((x) => (
        <PorchPost key={x} x={x} />
      ))}
      {[-crossHalf + 0.25, crossHalf - 0.25].map((x) => (
        <PorchPost key={x} x={x} stone />
      ))}
      <Rail x0={-5.8} x1={-3.9} />
      <Rail x0={3.9} x1={5.8} />
      <Rail x0={-3.9} x1={-1.95} />
      <Rail x0={1.95} x1={3.9} />
      {/* Lean-to roofs on both sides of the entrance gable */}
      {[-1, 1].map((s) => (
        <Block
          key={s}
          position={[s * 4.4, WALL_TOP - 0.35, FRONT_Z + porchRoofLen / 2 - 0.05]}
          size={[4.2, 0.09, porchRoofLen / Math.cos(porchRoofTilt)]}
          rotation={[porchRoofTilt, 0, 0]}
          color={ROOF}
        />
      ))}

      {/* ---- Front door and windows ---- */}
      <Block position={[0, DECK_TOP + 1.25, FRONT_Z + 0.04]} size={[2.1, 2.5, 0.12]} color={TRIM} shadow={false} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Block position={[s * 0.45, DECK_TOP + 1.05, FRONT_Z + 0.12]} size={[0.86, 2.1, 0.08]} color={WOOD_DARK} shadow={false} />
          <Glass position={[s * 0.45, DECK_TOP + 1.45, FRONT_Z + 0.17]} size={[0.5, 1.0, 0.02]} />
          <Block position={[s * 0.45, DECK_TOP + 0.5, FRONT_Z + 0.17]} size={[0.6, 0.7, 0.03]} color={WOOD} shadow={false} />
        </group>
      ))}
      <Glass position={[0, DECK_TOP + 2.28, FRONT_Z + 0.12]} size={[1.8, 0.3, 0.03]} />
      <Block position={[0.12, DECK_TOP + 1.05, FRONT_Z + 0.2]} size={[0.05, 0.25, 0.04]} color={IRON} shadow={false} />
      <Block position={[-0.12, DECK_TOP + 1.05, FRONT_Z + 0.2]} size={[0.05, 0.25, 0.04]} color={IRON} shadow={false} />
      <Antlers position={[0, WALL_TOP + 0.25, PORCH_FRONT - 0.5]} />
      {[-5.0, -3.4, 3.4, 5.0].map((x) => (
        <Window key={x} position={[x, 1.75, FRONT_Z + 0.01]} shutters flowers />
      ))}
      <Lantern position={[-1.2, 2.5, FRONT_Z + 0.18]} light />
      <Lantern position={[1.2, 2.5, FRONT_Z + 0.18]} />
      <Lantern position={[-3.9, 2.65, PORCH_FRONT - 0.15]} />
      <Lantern position={[3.9, 2.65, PORCH_FRONT - 0.15]} />

      {/* ---- Porch furniture and farm details ---- */}
      <RockingChair x={-4.7} z={2.5} rotY={0.15} />
      <RockingChair x={-3.8} z={2.45} rotY={-0.1} />
      <Block position={[4.8, DECK_TOP + 0.42, 2.0]} size={[1.8, 0.07, 0.45]} color={WOOD} />
      <Block position={[4.0, DECK_TOP + 0.2, 2.0]} size={[0.07, 0.4, 0.4]} color={WOOD_DARK} shadow={false} />
      <Block position={[5.6, DECK_TOP + 0.2, 2.0]} size={[0.07, 0.4, 0.4]} color={WOOD_DARK} shadow={false} />
      <Block position={[4.8, DECK_TOP + 0.85, 1.85]} size={[1.8, 0.45, 0.05]} color={WOOD} shadow={false} />
      <Barrel x={-5.55} z={2.3} />
      <Barrel x={5.5} z={2.9} />
      <Block position={[5.45, DECK_TOP + 0.22, 2.45]} size={[0.9, 0.44, 0.5]} color={HAY} />
      <Block position={[5.5, DECK_TOP + 0.66, 2.45]} size={[0.85, 0.44, 0.5]} color="#c9a64e" />
      <WagonWheel position={[-5.7, DECK_TOP + 0.62, FRONT_Z + 0.14]} />
      {/* Saddle rail by the door */}
      <Block position={[2.9, DECK_TOP + 1.4, FRONT_Z + 0.12]} size={[0.9, 0.08, 0.12]} color={WOOD} shadow={false} />
      <Block position={[2.9, DECK_TOP + 1.18, FRONT_Z + 0.14]} size={[0.5, 0.2, 0.2]} color="#6b3f22" shadow={false} />

      {/* ---- East wall ---- */}
      <Window position={[HALF_W + 0.01, 1.75, -1.9]} rotationY={Math.PI / 2} shutters />
      <Window position={[HALF_W + 0.01, 1.75, 0.5]} rotationY={Math.PI / 2} shutters />
      <Window position={[HALF_W + 0.01, 4.1, MID_Z]} rotationY={Math.PI / 2} w={0.6} h={0.7} />
      <Firewood x={HALF_W + 0.35} z={-1.0} />
      {/* ---- West wall (chimney in the middle) ---- */}
      <Window position={[-HALF_W - 0.01, 1.75, 1.0]} rotationY={-Math.PI / 2} shutters />
      <Window position={[-HALF_W - 0.01, 4.1, MID_Z + 0.2]} rotationY={-Math.PI / 2} w={0.6} h={0.7} />
      {/* ---- Back wall: windows and a service door with a step ---- */}
      {[-4.6, -2.4, 0.2, 5.0].map((x) => (
        <Window key={x} position={[x, 1.75, BACK_Z - 0.01]} rotationY={Math.PI} />
      ))}
      <group position={[2.8, 0, BACK_Z - 0.01]} rotation={[0, Math.PI, 0]}>
        <Block position={[0, 1.15, 0.04]} size={[1.2, 2.3, 0.1]} color={TRIM} shadow={false} />
        <Block position={[0, 1.05, 0.1]} size={[0.95, 2.05, 0.06]} color={WOOD_DARK} shadow={false} />
        <Block position={[0, 0.2, 0.5]} size={[1.4, 0.2, 0.7]} color={STONE} />
      </group>
    </Meters>
  );
}
