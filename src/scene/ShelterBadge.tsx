import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, SRGBColorSpace, SpriteMaterial, type Sprite } from 'three';
import { ANIMAL_PRODUCTS, ANIMAL_PRODUCT_IDS } from '../data/animals';
import { FERTILIZER } from '../data/fertilizer';
import { manureUnits } from '../game/shelters';
import { footprintOf } from '../game/structures';
import { useGameStore } from '../store/gameStore';
import { cornerToWorld } from './coords';
import { PALETTE } from './palette';
import type { PlacedProps } from './structureModels';

const noRaycast = () => null;
/** Height of the badge above the ground, in world units (tiles). */
const BADGE_HEIGHT = 1.15;
/** Canvas size in pixels and the badge height in world units. */
const CANVAS_W = 512;
const CANVAS_H = 96;
const WORLD_H = 0.4;
const FONT = '800 52px Nunito, system-ui, sans-serif';

/** Draws the pill with its text and returns the pill width in pixels. */
const drawBadge = (ctx: CanvasRenderingContext2D, text: string): number => {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.font = FONT;
  const width = Math.min(CANVAS_W - 8, ctx.measureText(text).width + 44);
  const x = (CANVAS_W - width) / 2;
  ctx.fillStyle = PALETTE.badgeFill;
  ctx.strokeStyle = PALETTE.badgeBorder;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(x, 6, width, CANVAS_H - 12, (CANVAS_H - 12) / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = PALETTE.badgeText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, CANVAS_W / 2, CANVAS_H / 2 + 3);
  return width;
};

/** Floating "🥚 3  💩 1" over a shelter while products or manure wait for the crew. Redrawn only when the text changes. */
export function ShelterBadge({ id, type, x, y, rotation }: PlacedProps & { id: number }) {
  const sprite = useRef<Sprite>(null);
  const fp = footprintOf(type, x, y, rotation);
  const [x0, z0] = cornerToWorld(fp.x, fp.y);

  // The drawn text lives with its canvas, so a new canvas always gets drawn.
  const badge = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = CANVAS_W;
    c.height = CANVAS_H;
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    const m = new SpriteMaterial({ map: t, transparent: true, depthTest: false, toneMapped: false });
    return { canvas: c, texture: t, material: m, text: '' };
  }, []);
  const { canvas, texture, material } = badge;
  useEffect(
    () => () => {
      texture.dispose();
      material.dispose();
    },
    [texture, material],
  );

  useFrame(({ clock }) => {
    const s = sprite.current;
    const ctx = canvas.getContext('2d');
    if (!s || !ctx) return;
    const shelter = useGameStore.getState().game.structures.find((x) => x.id === id);
    const stock = shelter?.stock;
    const manure = shelter ? manureUnits(shelter) : 0;
    const next = [
      ...ANIMAL_PRODUCT_IDS.filter((p) => (stock?.[p] ?? 0) > 0).map((p) => `${ANIMAL_PRODUCTS[p].icon} ${stock?.[p] ?? 0}`),
      ...(manure > 0 ? [`${FERTILIZER.icon} ${manure}`] : []),
    ].join('  ');
    if (next !== badge.text) {
      badge.text = next;
      if (next) {
        drawBadge(ctx, next);
        texture.needsUpdate = true;
      }
    }
    s.visible = next !== '';
    if (next) s.position.y = BADGE_HEIGHT + Math.sin(clock.elapsedTime * 3) * 0.03;
  });

  return (
    <sprite
      ref={sprite}
      material={material}
      position={[x0 + fp.width / 2, BADGE_HEIGHT, z0 + fp.depth / 2]}
      scale={[(WORLD_H * CANVAS_W) / CANVAS_H, WORLD_H, 1]}
      raycast={noRaycast}
      renderOrder={5}
      visible={false}
    />
  );
}
