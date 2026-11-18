import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useRef } from 'react';
import { MathUtils, MeshBasicMaterial, MeshStandardMaterial, type Group } from 'three';
import { ANIMAL_IDS, type AnimalId } from '../data/animals';
import { GRID_SIZE } from '../data/world';
import { animalActivity, isInside } from '../game/animals';
import { useGameStore } from '../store/gameStore';
import { hash01 } from './coords';
import { animalModel } from './models/animalModels';

const HALF = GRID_SIZE / 2;
const MATERIAL = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
/** Invisible material for the click box (keeps small animals easy to click). */
const HITBOX_MATERIAL = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
/** Leg swing per world unit walked, relative to the hip height. */
const STRIDE = 4.5;

const angleDelta = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));

function AnimalFigure({ id, kind }: { id: number; kind: AnimalId }) {
  const model = animalModel(kind);
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const legs = useRef<Array<Group | null>>([]);
  const anim = useRef({ x: NaN, z: NaN, heading: hash01(id) * Math.PI * 2, phase: 0, time: hash01(id + 1) * 10 });

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
      // Shorter legs take more steps for the same distance.
      a.phase += (moved * STRIDE) / Math.max(0.01, (model.legs[0]?.[1] ?? 0.2) * model.fit[1]);
    }
    a.x = x;
    a.z = z;

    // Asleep in the shelter: out of sight until morning.
    r.visible = !isInside(game, animal);
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
  });

  // Pressing on an animal does not start an area drag on the tile below.
  const stopDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button === 0) e.stopPropagation();
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
    <group ref={root} onPointerDown={stopDown} onPointerOver={onOver} onPointerOut={onOut}>
      <group scale={model.fit}>
      <mesh position={model.hitboxCenter} material={HITBOX_MATERIAL}>
        <boxGeometry args={model.hitbox} />
      </mesh>
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
      </group>
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
