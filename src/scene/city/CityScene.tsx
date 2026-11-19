import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CanvasTexture, SRGBColorSpace, SpriteMaterial, type Group } from 'three';
import { CITY_SHOPS, CITY_SHOP_IDS, type CityShopId } from '../../data/city';
import { VEHICLES } from '../../data/market';
import { METER_SCALE } from '../../data/scale';
import { useGameStore } from '../../store/gameStore';
import { setHoverCursor } from '../cursor';
import { Pickup } from '../models/Car';
import { Block, GableRoof, Glass, Meters } from '../models/Buildings';
import { PALETTE } from '../palette';

/** Max pointer travel (px) for a click to count as a click and not a camera drag. */
const CLICK_TOLERANCE = 5;
const ASPHALT = '#4a4d52';
const SIDEWALK = '#b9b2a3';
const GRASS = '#7fa653';
const LAMP = '#3b3f44';

/** A painted shop sign: the name on a board, drawn once into a canvas. */
function Sign({ text, color, position, width }: { text: string; color: string; position: [number, number, number]; width: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 512, 128);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, 502, 118);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 64px Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 256, 68, 480);
    }
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={position}>
      <planeGeometry args={[width, width / 4]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

/** The shop's name floating above its roof, readable from any side. */
function RoofLabel({ text, color, height }: { text: string; color: string; height: number }) {
  const material = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 112;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = '800 56px Nunito, system-ui, sans-serif';
      const width = Math.min(500, ctx.measureText(text).width + 48);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect((512 - width) / 2, 8, width, 96, 48);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 256, 58, 470);
    }
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return new SpriteMaterial({ map: t, transparent: true, toneMapped: false, depthWrite: false });
  }, [text, color]);
  useEffect(
    () => () => {
      material.map?.dispose();
      material.dispose();
    },
    [material],
  );
  return <sprite material={material} position={[0, height + 3.2, 0]} scale={[8, 1.75, 1]} raycast={() => null} />;
}

/** One clickable shop: walls, roof, awning, door, windows and its sign, facing +z (the street). */
function Shop({ id }: { id: CityShopId }) {
  const def = CITY_SHOPS[id];
  const [hover, setHover] = useState(false);
  const open = useGameStore((s) => s.openCityShop);
  const { width: w, depth: d, height: h } = def.size;
  const front = d / 2;
  const stripes = Math.max(2, Math.round(w / 1.2));
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.button !== 0 || e.delta > CLICK_TOLERANCE) return;
    e.stopPropagation();
    open(id);
  };
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHover(true);
    setHoverCursor(true);
  };
  const onOut = () => {
    setHover(false);
    setHoverCursor(false);
  };
  return (
    <group
      position={[def.position[0], 0, def.position[1]]}
      rotation={[0, def.facing === 'south' ? 0 : Math.PI, 0]}
      onClick={onClick}
      onPointerOver={onOver}
      onPointerOut={onOut}
      scale={hover ? 1.03 : 1}
    >
      <Block position={[0, 0.1, 0]} size={[w + 0.6, 0.2, d + 0.6]} color={SIDEWALK} />
      <Block position={[0, h / 2 + 0.2, 0]} size={[w, h, d]} color={def.wall} />
      {def.roof === 'gable' ? (
        <GableRoof length={w + 0.4} span={d + 0.6} rise={2} base={h + 0.2} color={def.trim} position={[0, 0]} />
      ) : (
        <Block position={[0, h + 0.35, 0]} size={[w + 0.3, 0.3, d + 0.3]} color={def.trim} />
      )}
      {/* Striped awning over the shop front */}
      {Array.from({ length: stripes }, (_, i) => {
        const stripe = w / stripes;
        return (
          <Block
            key={i}
            position={[-w / 2 + stripe * (i + 0.5), 2.9, front + 0.6]}
            size={[stripe, 0.12, 1.3]}
            color={i % 2 ? '#ffffff' : def.accent}
            rotation={[0.25, 0, 0]}
          />
        );
      })}
      {/* Door and shop windows */}
      <Block position={[0, 1.15, front + 0.05]} size={[1.4, 2.3, 0.1]} color={def.trim} />
      <Glass position={[0, 1.2, front + 0.11]} size={[1.0, 1.8, 0.04]} />
      {[-1, 1].map((side) => (
        <Glass key={side} position={[side * (w / 2 - 1.6), 1.4, front + 0.06]} size={[2, 1.4, 0.05]} />
      ))}
      <Sign text={def.label} color={def.accent} position={[0, h - 0.5, front + 0.12]} width={Math.min(w - 0.4, 6)} />
      <RoofLabel text={def.label} color={def.accent} height={h} />
      {hover && <Block position={[0, 0.22, 0]} size={[w + 1, 0.05, d + 1]} color={PALETTE.selection} shadow={false} />}
    </group>
  );
}

function StreetLamp({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Block position={[0, 2, 0]} size={[0.14, 4, 0.14]} color={LAMP} />
      <Block position={[0, 4.05, 0.3]} size={[0.5, 0.2, 0.9]} color={LAMP} />
    </group>
  );
}

/** The farm's own vehicle, parked in front of the market (the pickup model scales itself to meters). */
function ParkedVehicle() {
  const level = useGameStore((s) => s.game.vehicleLevel);
  const wheels = useRef<Array<Group | null>>([]);
  const def = VEHICLES[level];
  return (
    <group position={[-10 * METER_SCALE, 0, 3 * METER_SCALE]} rotation={[0, Math.PI / 2, 0]} scale={def.scale}>
      <Pickup color={def.color} wheels={wheels} />
    </group>
  );
}

/**
 * The town: one street with clickable shops on both sides (they open the shop panels). Built in
 * meters around the origin, so the camera rig works the same as on the farm.
 */
export function CityScene() {
  return (
    <group>
      <Meters>
        {/* Ground, street, sidewalks and crossings */}
        <Block position={[0, -0.05, 0]} size={[220, 0.1, 160]} color={GRASS} />
        <Block position={[0, 0.01, 0]} size={[110, 0.06, 8]} color={ASPHALT} />
        {[-1, 1].map((side) => (
          <Block key={side} position={[0, 0.06, side * 5.2]} size={[110, 0.12, 2.4]} color={SIDEWALK} />
        ))}
        {Array.from({ length: 14 }, (_, i) => (
          <Block key={i} position={[-45 + i * 7, 0.05, 0]} size={[3, 0.02, 0.2]} color="#e8e2cf" shadow={false} />
        ))}
        {[-36, -12, 12, 36].map((x) => [-6.6, 6.6].map((z) => <StreetLamp key={`${x}${z}`} x={x} z={z} />))}
        {/* Trees behind the shops */}
        {Array.from({ length: 16 }, (_, i) => {
          const x = -52 + i * 7;
          const z = i % 2 ? -26 : 27;
          return (
            <group key={i} position={[x, 0, z]}>
              <Block position={[0, 1.2, 0]} size={[0.4, 2.4, 0.4]} color="#6e4a2a" />
              <Block position={[0, 3.4, 0]} size={[2.6, 2.4, 2.6]} color="#4f8a35" rotation={[0, i, 0]} />
            </group>
          );
        })}
        {CITY_SHOP_IDS.map((id) => (
          <Shop key={id} id={id} />
        ))}
      </Meters>
      <ParkedVehicle />
    </group>
  );
}
