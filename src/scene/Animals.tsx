import { Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useRef } from 'react';
import { MathUtils, MeshStandardMaterial, type Group } from 'three';
import { ANIMALS, ANIMAL_IDS, ANIMAL_PRODUCTS, type AnimalId } from '../data/animals';
import { GRID_SIZE } from '../data/world';
import { animalActivity } from '../game/animals';
import { useGameStore } from '../store/gameStore';
import { hash01 } from './coords';
import { animalModel } from './models/animalModels';

const HALF = GRID_SIZE / 2;
/** Max pointer travel (px) for a click to count as a click and not a camera drag. */
const CLICK_TOLERANCE = 5;
const MATERIAL = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });

const angleDelta = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));

function AnimalFigure({ id, kind }: { id: number; kind: AnimalId }) {
  const model = animalModel(kind);
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const legs = useRef<Array<Group | null>>([]);
  const icon = useRef<HTMLDivElement>(null);
  const anim = useRef({ x: NaN, z: NaN, heading: hash01(id) * Math.PI * 2, phase: 0, time: hash01(id + 1) * 10 });
  const product = ANIMALS[kind].product;

  useFrame((_, delta) => {
    const { game, settings } = useGameStore.getState();
    const animal = game.animals.find((a) => a.id === id);
    const r = root.current;
    const b = body.current;
    if (!animal || !r || !b) return;
    const a = anim.current;
    const dt = Math.min(delta, 0.1);
    a.time += dt * settings.speed;

    const x = animal.x - HALF;
    const z = animal.y - HALF;
    if (Number.isNaN(a.x)) {
      a.x = x;
      a.z = z;
    }
    const moved = Math.hypot(x - a.x, z - a.z);
    if (moved > 1e-4) {
      a.heading = Math.atan2(x - a.x, z - a.z);
      a.phase += moved * (kind === 'chicken' || kind === 'duck' ? 40 : 16);
    }
    a.x = x;
    a.z = z;

    const activity = animalActivity(game, animal);
    const k = 1 - Math.exp(-10 * dt);
    r.position.set(x, 0, z);
    r.rotation.y += angleDelta(r.rotation.y, a.heading) * (1 - Math.exp(-6 * dt));

    // Sleeping: lie down (legs tucked, body on the ground). Otherwise stand, bob and swing legs.
    const sleeping = activity === 'sleeping';
    const hip = model.legs[0]?.[1] ?? 0;
    const walking = activity === 'walking';
    const bob = walking ? Math.abs(Math.sin(a.phase)) * 0.02 : Math.sin(a.time * 1.5) * 0.004;
    b.position.y = MathUtils.lerp(b.position.y, sleeping ? -hip * 0.85 : bob, k);
    // Grazing animals dip forward now and then.
    const graze = activity === 'grazing' && Math.sin(a.time * 0.7 + id) > 0.3 ? 0.12 : 0;
    b.rotation.x = MathUtils.lerp(b.rotation.x, graze, k);
    legs.current.forEach((leg, i) => {
      if (!leg) return;
      leg.visible = !sleeping;
      const pairPhase = model.legs.length === 2 ? i * Math.PI : i === 0 || i === 3 ? 0 : Math.PI;
      const swing = walking ? Math.sin(a.phase + pairPhase) * 0.55 : 0;
      leg.rotation.x = MathUtils.lerp(leg.rotation.x, swing, k * 1.5);
    });

    if (icon.current) {
      const show = animal.hasProduct && !!product;
      icon.current.style.display = show ? 'block' : 'none';
      if (show) icon.current.style.transform = `translateY(${Math.sin(a.time * 3) * 4}px)`;
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.button !== 0 || e.delta > CLICK_TOLERANCE) return;
    e.stopPropagation();
    useGameStore.getState().collectAnimal(id);
  };
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    useGameStore.getState().setHoveredAnimal(id);
    document.body.style.cursor = 'pointer';
  };
  const onOut = () => {
    if (useGameStore.getState().hoveredAnimal === id) useGameStore.getState().setHoveredAnimal(null);
    document.body.style.cursor = '';
  };

  return (
    <group ref={root} onClick={onClick} onPointerOver={onOver} onPointerOut={onOut}>
      <group ref={body}>
        <mesh geometry={model.body} material={MATERIAL} castShadow receiveShadow />
        {model.legs.map((position, i) => (
          <group
            key={i}
            position={[position[0], position[1], position[2]]}
            ref={(el) => {
              legs.current[i] = el;
            }}
          >
            <mesh geometry={model.leg} material={MATERIAL} castShadow />
          </group>
        ))}
      </group>
      {product && (
        <Html position={[0, model.height + 0.25, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div
            ref={icon}
            style={{ display: 'none' }}
            className="rounded-full border-2 border-wood/50 bg-parchment/95 px-1.5 text-lg leading-7 shadow"
          >
            {ANIMAL_PRODUCTS[product].icon}
          </div>
        </Html>
      )}
    </group>
  );
}

/** Farm animals, animated from the game state every frame (re-renders only when one is added or removed). */
export function Animals() {
  const list = useGameStore((s) => s.game.animals.map((a) => `${a.id}:${a.kind}`).join(','));
  return (
    <group>
      {list
        .split(',')
        .filter(Boolean)
        .map((entry) => {
          const [id = '', name = ''] = entry.split(':');
          const kind = ANIMAL_IDS.find((k) => k === name);
          return kind ? <AnimalFigure key={id} id={Number(id)} kind={kind} /> : null;
        })}
    </group>
  );
}
