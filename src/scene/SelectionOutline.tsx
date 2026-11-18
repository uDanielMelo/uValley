import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { MeshBasicMaterial } from 'three';
import { footprintOf, structureAt } from '../game/structures';
import { useGameStore, type GameStore } from '../store/gameStore';
import { cornerToWorld } from './coords';
import { PALETTE } from './palette';

const noRaycast = () => null;
const BAND = 0.07;
const LIFT = 0.06;

interface Frame {
  x: number;
  z: number;
  width: number;
  depth: number;
}

/** "x:y:w:d" of a structure's footprint, as a primitive for the selector. */
const frameKey = (game: GameStore['game'], id: number | null | undefined): string => {
  const s = id == null ? undefined : game.structures.find((x) => x.id === id);
  if (!s) return '';
  const fp = footprintOf(s.type, s.x, s.y, s.rotation);
  return `${fp.x}:${fp.y}:${fp.width}:${fp.depth}`;
};

const parseFrame = (key: string): Frame | null => {
  if (!key) return null;
  const [x = 0, y = 0, width = 1, depth = 1] = key.split(':').map(Number);
  const [x0, z0] = cornerToWorld(x, y);
  return { x: x0 + width / 2, z: z0 + depth / 2, width, depth };
};

/** Four thin bands around a footprint, lying on the ground. */
function Outline({ frame, color, pulse }: { frame: Frame; color: string; pulse: boolean }) {
  // One material for the four bands, so they pulse together.
  const material = useMemo(
    () => new MeshBasicMaterial({ color, transparent: true, opacity: pulse ? 0.8 : 0.45, depthWrite: false, toneMapped: false }),
    [color, pulse],
  );
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => {
    if (pulse) material.opacity = 0.65 + Math.sin(clock.elapsedTime * 4) * 0.25;
  });
  const w = frame.width + BAND;
  const d = frame.depth + BAND;
  const bands: [number, number, number, number][] = [
    [0, -d / 2, w + BAND, BAND],
    [0, d / 2, w + BAND, BAND],
    [-w / 2, 0, BAND, d],
    [w / 2, 0, BAND, d],
  ];
  return (
    <group position={[frame.x, LIFT, frame.z]}>
      {bands.map(([bx, bz, bw, bd], i) => (
        <mesh
          key={i}
          position={[bx, 0, bz]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={material}
          raycast={noRaycast}
          renderOrder={3}
        >
          <planeGeometry args={[bw, bd]} />
        </mesh>
      ))}
    </group>
  );
}

/** Outline of the selected structure (pulsing) and of the one under the mouse while using the hand. */
export function SelectionOutline() {
  const selected = useGameStore((s) => frameKey(s.game, s.selectedStructure));
  const hovered = useGameStore((s) =>
    s.tool === null && s.buildMode === null && s.hoveredTile !== null
      ? frameKey(s.game, structureAt(s.game, s.hoveredTile)?.id)
      : '',
  );
  const selectedFrame = parseFrame(selected);
  const hoveredFrame = hovered !== selected ? parseFrame(hovered) : null;
  return (
    <>
      {selectedFrame && <Outline key="selected" frame={selectedFrame} color={PALETTE.selection} pulse />}
      {hoveredFrame && <Outline key="hovered" frame={hoveredFrame} color={PALETTE.hoverValid} pulse={false} />}
    </>
  );
}
