import { Html } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial } from 'three';
import { GRID_SIZE } from '../data/world';
import { tileCoords } from '../game/grid';
import type { Field } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { FIELD_LINE, FIELD_SELECTED } from './palette';

const HALF = GRID_SIZE / 2;
const Y = 0.05;
const noRaycast = () => null;

const LINE = new LineBasicMaterial({ color: FIELD_LINE, transparent: true, opacity: 0.9, depthWrite: false });
const SELECTED = new LineBasicMaterial({ color: FIELD_SELECTED, transparent: true, opacity: 1, depthWrite: false });

type Rect = Pick<Field, 'x' | 'y' | 'w' | 'h'>;

const outline = (r: Rect): BufferGeometry => {
  const x0 = r.x - HALF + 0.04;
  const z0 = r.y - HALF + 0.04;
  const x1 = r.x + r.w - HALF - 0.04;
  const z1 = r.y + r.h - HALF - 0.04;
  const p = [x0, Y, z0, x1, Y, z0, x1, Y, z0, x1, Y, z1, x1, Y, z1, x0, Y, z1, x0, Y, z1, x0, Y, z0];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(p, 3));
  return geometry;
};

function FieldOutline({ rect, selected }: { rect: Rect; selected: boolean }) {
  const geometry = useMemo(() => outline(rect), [rect]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <lineSegments geometry={geometry} material={selected ? SELECTED : LINE} raycast={noRaycast} renderOrder={5} />;
}

function FieldTag({ field, selected }: { field: Field; selected: boolean }) {
  return (
    <group>
      <FieldOutline rect={field} selected={selected} />
      <Html
        position={[field.x + field.w / 2 - HALF, Y, field.y + field.h / 2 - HALF]}
        center
        style={{ pointerEvents: 'none' }}
        zIndexRange={[10, 0]}
      >
        <span
          className={`rounded-md px-1.5 py-0.5 text-[11px] font-black whitespace-nowrap shadow ${
            selected ? 'bg-coin text-wood-dark' : 'bg-wood-dark/80 text-parchment'
          }`}
        >
          {field.name}
        </span>
      </Html>
    </group>
  );
}

/** The rectangle being drawn with the new field tool. */
function DraftField() {
  const drag = useGameStore((s) => s.fieldDrag);
  const rect = useMemo(() => {
    if (!drag) return null;
    const a = tileCoords(drag.anchor);
    const b = tileCoords(drag.current);
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
  }, [drag]);
  return rect ? <FieldOutline rect={rect} selected /> : null;
}

/** Field names and outlines on the ground, in the soil view only. */
export function FieldLabels() {
  const active = useGameStore((s) => s.infoView === 'soil');
  const fields = useGameStore((s) => s.game.fields);
  const selected = useGameStore((s) => s.selectedField);
  if (!active) return null;
  return (
    <group>
      {fields.map((f) => (
        <FieldTag key={f.id} field={f} selected={f.id === selected} />
      ))}
      <DraftField />
    </group>
  );
}
