import { Block, CONCRETE, GableRoof, HAY, Meters, WHITE, WOOD, WOOD_DARK } from './Buildings';

/**
 * Animal shelters, authored in METERS like Buildings.tsx: origin at the footprint center, y = 0 on
 * the ground, front (+z) where the animals go in and out.
 */

type Vec2 = [number, number];

/** Wooden rail fence along a straight run (posts every ~1.8 m, rails at the given heights). */
function RailFence({ from, to, rails, height, color = WOOD }: { from: Vec2; to: Vec2; rails: number[]; height: number; color?: string }) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(-dz, dx);
  const posts = Math.max(1, Math.round(length / 1.8));
  const cx = (from[0] + to[0]) / 2;
  const cz = (from[1] + to[1]) / 2;
  return (
    <group>
      {Array.from({ length: posts + 1 }, (_, i) => {
        const t = i / posts;
        return (
          <Block
            key={i}
            position={[from[0] + dx * t, height / 2, from[1] + dz * t]}
            size={[0.12, height, 0.12]}
            color={WOOD_DARK}
          />
        );
      })}
      {rails.map((y) => (
        <Block key={y} position={[cx, y, cz]} size={[length, 0.12, 0.05]} color={color} rotation={[0, angle, 0]} />
      ))}
    </group>
  );
}

/** Flat ground patch (mud, straw, packed earth) lying just above the grass. */
function Ground({ position, size, color }: { position: Vec2; size: Vec2; color: string }) {
  return (
    <mesh position={[position[0], 0.02, position[1]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={size} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

/** Trough: a long open box on the ground. */
function Trough({ position, length, rotationY = 0 }: { position: Vec2; length: number; rotationY?: number }) {
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, rotationY, 0]}>
      <Block position={[0, 0.2, 0]} size={[length, 0.4, 0.5]} color={WOOD_DARK} />
      <Block position={[0, 0.39, 0]} size={[length - 0.12, 0.04, 0.38]} color={HAY} shadow={false} />
    </group>
  );
}

// ---------- Pigsty: 2×1 tiles = 7 × 3.5 m ----------

const STY_WALL = '#c9b39a';
const STY_ROOF = '#8a5a3c';
const MUD = '#6b4a2e';

/** Pigsty: low masonry shelter with a lean-to roof and a fenced mud pen with a trough. */
export function Pigsty() {
  return (
    <Meters>
      {/* Shelter on the left: 2.6 × 3 m, walls 1.5 m, roof sloping to the back */}
      <Block position={[-2.05, 0.75, -0.1]} size={[2.6, 1.5, 3.0]} color={STY_WALL} />
      <Block position={[-2.05, 1.72, -0.1]} size={[3.0, 0.12, 3.5]} color={STY_ROOF} rotation={[-0.2, 0, 0]} />
      <Block position={[-1.55, 0.5, 1.42]} size={[0.9, 1.0, 0.05]} color="#3a2a1c" shadow={false} />
      {/* Mud pen on the right */}
      <Ground position={[1.3, 0]} size={[4.0, 3.2]} color={MUD} />
      <RailFence from={[-0.7, 1.6]} to={[3.3, 1.6]} rails={[0.35, 0.75]} height={0.9} />
      <RailFence from={[-0.7, -1.6]} to={[3.3, -1.6]} rails={[0.35, 0.75]} height={0.9} />
      <RailFence from={[3.3, -1.6]} to={[3.3, 1.6]} rails={[0.35, 0.75]} height={0.9} />
      <Trough position={[2.4, -1.15]} length={1.6} />
      {/* A puddle */}
      <mesh position={[1.0, 0.03, 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.6, 10]} />
        <meshStandardMaterial color="#4f3a26" roughness={0.3} />
      </mesh>
    </Meters>
  );
}

// ---------- Sheepfold: 2×2 tiles = 7 × 7 m ----------

const FOLD_WALL = '#d8c8a4';
const FOLD_ROOF = '#6d7a5a';

/** Sheepfold: low plank shed at the back with a wide opening, and a fenced yard with a hay rack. */
export function Sheepfold() {
  const shedZ = -2.0;
  const shedD = 2.8;
  return (
    <Meters>
      <Ground position={[0, 0.8]} size={[6.6, 5.0]} color="#a8925e" />
      <Block position={[0, 1.0, shedZ]} size={[6.2, 2.0, shedD]} color={FOLD_WALL} />
      <GableRoof length={6.8} span={shedD + 0.7} rise={1.1} base={2.0} color={FOLD_ROOF} position={[0, shedZ]} />
      {/* Wide dark opening and plank seams */}
      <Block position={[-0.8, 0.8, shedZ + shedD / 2 + 0.02]} size={[2.4, 1.6, 0.04]} color="#3a2a1c" shadow={false} />
      {[0.6, 1.3].map((y) => (
        <Block key={y} position={[1.9, y, shedZ + shedD / 2 + 0.02]} size={[2.2, 0.03, 0.02]} color={WOOD_DARK} shadow={false} />
      ))}
      {/* Yard fence (1.1 m), with a gate gap on the front */}
      <RailFence from={[-3.3, -0.6]} to={[-3.3, 3.3]} rails={[0.4, 0.95]} height={1.1} />
      <RailFence from={[3.3, -0.6]} to={[3.3, 3.3]} rails={[0.4, 0.95]} height={1.1} />
      <RailFence from={[-3.3, 3.3]} to={[-0.7, 3.3]} rails={[0.4, 0.95]} height={1.1} />
      <RailFence from={[0.7, 3.3]} to={[3.3, 3.3]} rails={[0.4, 0.95]} height={1.1} />
      {/* Hay rack */}
      <Block position={[2.2, 0.6, 0.6]} size={[1.4, 1.2, 0.7]} color={WOOD} />
      <Block position={[2.2, 1.25, 0.6]} size={[1.3, 0.25, 0.6]} color={HAY} />
    </Meters>
  );
}

// ---------- Corral: 3×2 tiles = 10.5 × 7 m ----------

const CORRAL_ROOF = '#7c4a33';

/** Corral: open-sided cattle shed on posts over a concrete floor, and a plank-fenced yard. */
export function Corral() {
  const shedZ = -2.0;
  const shedD = 2.8;
  const eave = 3.0;
  return (
    <Meters>
      <Ground position={[0, 1.2]} size={[10.0, 4.3]} color="#8f7550" />
      <Block position={[0, 0.06, shedZ]} size={[10.0, 0.12, shedD + 0.2]} color={CONCRETE} />
      {[-4.8, -1.6, 1.6, 4.8].flatMap((x) =>
        [shedZ - shedD / 2 + 0.1, shedZ + shedD / 2 - 0.1].map((z) => (
          <Block key={`${x}${z}`} position={[x, eave / 2, z]} size={[0.2, eave, 0.2]} color={WOOD_DARK} />
        )),
      )}
      {/* Back wall closes the shed to the wind */}
      <Block position={[0, 1.1, shedZ - shedD / 2 + 0.05]} size={[9.8, 2.2, 0.1]} color={WOOD} />
      <GableRoof length={10.4} span={shedD + 0.8} rise={1.2} base={eave} color={CORRAL_ROOF} position={[0, shedZ]} />
      <Trough position={[-2.5, shedZ + 0.3]} length={3.0} />
      {/* Yard: three-plank fence (1.5 m), gate gap on the front */}
      <RailFence from={[-5.1, -0.5]} to={[-5.1, 3.3]} rails={[0.45, 0.9, 1.35]} height={1.5} />
      <RailFence from={[5.1, -0.5]} to={[5.1, 3.3]} rails={[0.45, 0.9, 1.35]} height={1.5} />
      <RailFence from={[-5.1, 3.3]} to={[-1.0, 3.3]} rails={[0.45, 0.9, 1.35]} height={1.5} />
      <RailFence from={[1.0, 3.3]} to={[5.1, 3.3]} rails={[0.45, 0.9, 1.35]} height={1.5} />
      {/* Water trough */}
      <mesh position={[3.6, 0.3, 1.2]} castShadow>
        <cylinderGeometry args={[0.6, 0.6, 0.6, 10]} />
        <meshStandardMaterial color="#8f969d" flatShading />
      </mesh>
    </Meters>
  );
}

// ---------- Stable: 2×2 tiles = 7 × 7 m ----------

const STABLE_WALL = '#a8573e';
const STABLE_ROOF = '#4a4038';

/** Stable: red board building with three Dutch stall doors (top halves open) and a hay bale. */
export function Stable() {
  const z = -0.5;
  const depth = 5.4;
  const wallH = 3.0;
  const front = z + depth / 2;
  return (
    <Meters>
      <Block position={[0, 0.08, z]} size={[6.9, 0.16, depth + 0.3]} color={CONCRETE} />
      <Block position={[0, wallH / 2, z]} size={[6.6, wallH, depth]} color={STABLE_WALL} />
      <GableRoof length={7.2} span={depth + 0.9} rise={1.8} base={wallH} color={STABLE_ROOF} position={[0, z]} />
      <Block position={[0, wallH, front + 0.05]} size={[6.7, 0.18, 0.1]} color={WHITE} shadow={false} />
      {/* Three stalls: door 1.3 × 2.3 m, the top half open */}
      {[-2.1, 0, 2.1].map((x) => (
        <group key={x} position={[x, 0, front + 0.03]}>
          <Block position={[0, 1.2, 0]} size={[1.5, 2.5, 0.04]} color={WHITE} shadow={false} />
          <Block position={[0, 0.62, 0.03]} size={[1.3, 1.1, 0.05]} color={WOOD_DARK} />
          <Block position={[0, 1.75, 0.01]} size={[1.3, 1.0, 0.03]} color="#2a1f16" shadow={false} />
          <Block position={[0, 0.62, 0.06]} size={[1.2, 0.08, 0.03]} color={WHITE} shadow={false} />
        </group>
      ))}
      {/* Hay bale and a saddle rail by the side */}
      <Block position={[2.9, 0.45, front + 0.9]} size={[1.2, 0.9, 0.8]} color={HAY} rotation={[0, 0.3, 0]} />
      <Block position={[-3.0, 1.0, front + 0.5]} size={[0.8, 0.1, 0.1]} color={WOOD} />
    </Meters>
  );
}
