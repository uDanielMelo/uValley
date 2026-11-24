import { Block, Meters } from './Buildings';

const DIRT = '#a98a5f';
const POST = '#6e4b2c';
const RAIL = '#9c6b3c';
const RAMP = '#7a5230';
const STEEL = '#8e969b';

/** Footprint: 3 × 2 tiles = 10.5 × 7 m; the front (+z) faces the street with the truck bay. */
const W = 10.4;
const D = 6.9;
const FENCE_H = 1.5;
const RAILS = [0.45, 0.95, 1.4];
/** The holding area takes the left two thirds; the chute runs along the right third to the ramp. */
const HOLD_RIGHT = 1.6;
const CHUTE_LEFT = 2.4;
const CHUTE_RIGHT = 3.6;

interface FenceProps {
  from: [number, number];
  to: [number, number];
}

/** A straight wooden fence (posts every ~1.7 m and three rails) between two points on the ground. */
function Fence({ from, to }: FenceProps) {
  const [x1, z1] = from;
  const [x2, z2] = to;
  const length = Math.hypot(x2 - x1, z2 - z1);
  const posts = Math.max(1, Math.round(length / 1.7));
  const angle = Math.atan2(z2 - z1, x2 - x1);
  const mid: [number, number] = [(x1 + x2) / 2, (z1 + z2) / 2];
  return (
    <>
      {Array.from({ length: posts + 1 }, (_, i) => {
        const t = i / posts;
        return <Block key={i} position={[x1 + (x2 - x1) * t, FENCE_H / 2, z1 + (z2 - z1) * t]} size={[0.16, FENCE_H, 0.16]} color={POST} />;
      })}
      {RAILS.map((h) => (
        <Block key={h} position={[mid[0], h, mid[1]]} size={[length, 0.1, 0.06]} rotation={[0, -angle, 0]} color={RAIL} />
      ))}
    </>
  );
}

/**
 * Loading pen (curral de embarque), in meters: a fenced holding area where the animals for sale wait,
 * a narrow chute (brete) along the right side and a raised ramp at the front where the livestock
 * truck backs in. Origin = footprint center, front faces +z.
 */
export function LoadingPen() {
  const back = -D / 2;
  const front = D / 2;
  const left = -W / 2;
  return (
    <Meters>
      <Block position={[0, 0.03, 0]} size={[W, 0.06, D]} color={DIRT} shadow={false} />
      {/* Holding area: back, left and front (with a gate gap), and the side toward the chute */}
      <Fence from={[left, back]} to={[CHUTE_RIGHT, back]} />
      <Fence from={[left, back]} to={[left, front]} />
      <Fence from={[left, front]} to={[left + 2.2, front]} />
      <Fence from={[left + 5.0, front]} to={[HOLD_RIGHT, front]} />
      <Fence from={[HOLD_RIGHT, back + 1.4]} to={[HOLD_RIGHT, front]} />
      {/* Chute: a narrow alley from the holding area to the ramp */}
      <Fence from={[CHUTE_LEFT, back + 1.4]} to={[CHUTE_LEFT, front - 1.2]} />
      <Fence from={[CHUTE_RIGHT, back]} to={[CHUTE_RIGHT, front - 1.2]} />
      {/* Ramp up to a truck bed (about 1.2 m), with steel side guards */}
      <Block position={[(CHUTE_LEFT + CHUTE_RIGHT) / 2, 0.55, front - 0.6]} size={[CHUTE_RIGHT - CHUTE_LEFT, 0.12, 1.3]} rotation={[-0.55, 0, 0]} color={RAMP} />
      <Block position={[(CHUTE_LEFT + CHUTE_RIGHT) / 2, 0.6, front - 0.05]} size={[CHUTE_RIGHT - CHUTE_LEFT + 0.2, 1.2, 0.2]} color={RAMP} />
      {[CHUTE_LEFT - 0.05, CHUTE_RIGHT + 0.05].map((x) => (
        <Block key={x} position={[x, 1.4, front - 0.6]} size={[0.08, 0.9, 1.3]} color={STEEL} />
      ))}
      {/* Water trough and a hay bale in the holding area */}
      <Block position={[left + 0.8, 0.3, back + 0.7]} size={[0.6, 0.5, 2.2]} color={STEEL} />
      <Block position={[left + 3.2, 0.4, back + 0.8]} size={[1.2, 0.8, 0.8]} color="#d9c37a" />
      {/* Right of the chute: the handler's platform */}
      <Block position={[(CHUTE_RIGHT + W / 2) / 2, 0.45, 0]} size={[W / 2 - CHUTE_RIGHT - 0.2, 0.9, D - 1.4]} color={RAMP} />
    </Meters>
  );
}
