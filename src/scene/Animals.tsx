import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Suspense, useMemo, useRef, type ReactNode } from 'react';
import {
  CanvasTexture,
  Color,
  MathUtils,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SRGBColorSpace,
  SpriteMaterial,
  type Group,
  type Mesh,
  type Sprite,
} from 'three';
import { ANIMAL_IDS, BREED_IDS, type AnimalId, type BreedId } from '../data/animals';
import { GRID_SIZE } from '../data/world';
import { animalActivity, isInside, lifeStage } from '../game/animals';
import type { Animal } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { hash01 } from './coords';
import { setHoverCursor } from './cursor';
import { BREED_TINTS, CONDITION_TINTS, OLD_TINT, STAGE_SCALE, animalModel, type Condition } from './models/animalModels';
import { RIGGED_ANIMALS, createRig, poseRig, rigShape, rigTargets, type Motion } from './models/riggedAnimals';
import { PALETTE } from './palette';

const HALF = GRID_SIZE / 2;
/** Max pointer travel (px) for a click to count as a click and not a camera drag. */
const CLICK_TOLERANCE = 5;

/** How an animal looks beyond its breed: greyer when old, greenish when sick, reddish when wounded. */
type Look = { old: boolean; condition: Condition };

const lookKey = (look: Look): string => `${look.old ? 'old' : ''}:${look.condition ?? ''}`;
const lookOfKey = (key: string): Look => {
  const [old = '', condition = ''] = key.split(':');
  return { old: old === 'old', condition: condition === 'sick' || condition === 'wound' ? condition : null };
};

/** One material per breed and look, shared by every animal that looks the same. */
const materials = new Map<string, MeshStandardMaterial>();
const materialFor = (breed: BreedId, look: Look): MeshStandardMaterial => {
  const key = `${breed}:${lookKey(look)}`;
  let material = materials.get(key);
  if (!material) {
    const color = new Color(BREED_TINTS[breed]);
    if (look.old) color.lerp(new Color(OLD_TINT), 0.35);
    if (look.condition) color.lerp(new Color(CONDITION_TINTS[look.condition]), 0.45);
    material = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, color });
    materials.set(key, material);
  }
  return material;
};

/** Ring on the ground under the selected animal. */
const RING = new RingGeometry(0.42, 0.52, 24).rotateX(-Math.PI / 2);
const RING_MATERIAL = new MeshBasicMaterial({ color: PALETTE.selection, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
/** Invisible material for the click box (keeps small animals easy to click). */
const HITBOX_MATERIAL = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
/** Leg swing per world unit walked, relative to the hip height. */
const STRIDE = 4.5;

/** Floating icon over a sick (or wounded) animal: one shared sprite material per condition. */
const CONDITION_ICONS: Record<Exclude<Condition, null>, string> = { sick: '🤒', wound: '🩹' };
const iconMaterials = new Map<Exclude<Condition, null>, SpriteMaterial>();
const iconMaterial = (condition: Exclude<Condition, null>): SpriteMaterial => {
  let material = iconMaterials.get(condition);
  if (!material) {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = '72px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(CONDITION_ICONS[condition], 48, 54);
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false, toneMapped: false });
    iconMaterials.set(condition, material);
  }
  return material;
};
/** Icon size in world units. */
const ICON_SIZE = 0.2;
const noRaycast = () => null;

/** The look of a sickness the farm knows about. */
const conditionOf = (animal: Animal): Condition =>
  animal.health?.noticed ? (animal.health.disease === 'wound' ? 'wound' : 'sick') : null;

const angleDelta = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Size, click box and body motion of a figure, shared by the procedural and the rigged animals. */
interface FigureShape {
  fit: readonly [number, number, number];
  worldHeight: number;
  hitbox: readonly [number, number, number];
  hitboxCenter: readonly [number, number, number];
  /** Hip height in model units: the gait length. */
  hip: number;
  /** How far the body sinks when the animal lies down, in model units. */
  lieDrop: number;
  /** Forward tilt of the whole body while grazing (sick animals tilt 1.5×). */
  bodyGraze: number;
}

/** Moves the legs (and head, tail) for this frame; `k` is the smoothing factor. */
type Limbs = (motion: Motion, k: number) => void;

interface FigureProps {
  id: number;
  breed: BreedId;
  shape: FigureShape;
  limbs: Limbs;
  /** The body, given a callback that registers each mesh to tint by breed and look. */
  children: (keep: (mesh: Mesh | null) => void) => ReactNode;
}

function AnimalFigure({ id, breed, shape, limbs, children }: FigureProps) {
  const root = useRef<Group>(null);
  const sizer = useRef<Group>(null);
  const body = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const icon = useRef<Sprite>(null);
  const meshes = useRef<Mesh[]>([]);
  const moveLimbs = useRef(limbs);
  moveLimbs.current = limbs;
  /** null until the first frame (then the key of the look applied). */
  const looks = useRef<string | null>(null);
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
      a.phase += (moved * STRIDE) / Math.max(0.01, shape.hip * shape.fit[1]);
    }
    a.x = x;
    a.z = z;

    // Asleep in the shelter: out of sight until morning.
    r.visible = !isInside(game, animal);
    // Size follows the life stage; old animals turn greyer.
    const stage = lifeStage(game.gameMinutes, animal);
    const size = sizer.current;
    if (size) {
      // Snap on the first frame; afterwards growing up is gradual.
      const target = STAGE_SCALE[stage];
      size.scale.setScalar(looks.current === null ? target : MathUtils.lerp(size.scale.x, target, 1 - Math.exp(-3 * dt)));
    }
    const look: Look = { old: stage === 'old', condition: conditionOf(animal) };
    const key = lookKey(look);
    if (key !== looks.current) {
      looks.current = key;
      const material = materialFor(breed, look);
      for (const mesh of meshes.current) mesh.material = material;
      if (icon.current) {
        icon.current.visible = look.condition !== null;
        if (look.condition) icon.current.material = iconMaterial(look.condition);
      }
    }
    if (icon.current?.visible) {
      icon.current.position.y = shape.worldHeight * STAGE_SCALE[stage] + 0.14 + Math.sin(a.time * 2) * 0.03;
    }
    if (ring.current) ring.current.visible = useGameStore.getState().selectedAnimal === id;
    const activity = animalActivity(game, animal);
    const k = 1 - Math.exp(-10 * dt);
    r.position.set(x, 0, z);
    r.rotation.y += angleDelta(r.rotation.y, a.heading) * (1 - Math.exp(-6 * dt));

    // Sleeping: lie down. Otherwise stand, bob and move the legs.
    const sleeping = activity === 'sleeping';
    const walking = activity === 'walking';
    const bob = walking ? Math.abs(Math.sin(a.phase)) * 0.02 : Math.sin(a.time * 1.5) * 0.004;
    b.position.y = MathUtils.lerp(b.position.y, sleeping ? -shape.lieDrop : bob, k);
    // Grazing animals dip forward now and then; sick ones hang their head.
    const grazing = activity === 'grazing' && Math.sin(a.time * 0.7 + id) > 0.3;
    const sick = look.condition !== null;
    const tilt = sick ? shape.bodyGraze * 1.5 : grazing ? shape.bodyGraze : 0;
    b.rotation.x = MathUtils.lerp(b.rotation.x, tilt, k);
    moveLimbs.current({ phase: a.phase, time: a.time, walking, sleeping, grazing, sick }, k);
  });

  // Pressing on an animal does not start an area drag on the tile below.
  const stopDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button === 0) e.stopPropagation();
  };
  // With the hand, a click selects the animal (its card opens).
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const { tool, buildMode, selectAnimal } = useGameStore.getState();
    if (e.button !== 0 || e.delta > CLICK_TOLERANCE || tool !== null || buildMode !== null) return;
    e.stopPropagation();
    selectAnimal(id);
  };
  const keep = (mesh: Mesh | null) => {
    if (!mesh || meshes.current.includes(mesh)) return;
    meshes.current.push(mesh);
    // A mesh that shows up late (a model that finished loading) takes the current look right away.
    mesh.material = materialFor(breed, looks.current === null ? { old: false, condition: null } : lookOfKey(looks.current));
  };
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    useGameStore.getState().setHoveredAnimal(id);
    setHoverCursor(true);
  };
  const onOut = () => {
    if (useGameStore.getState().hoveredAnimal === id) useGameStore.getState().setHoveredAnimal(null);
    setHoverCursor(false);
  };

  return (
    <group ref={root} onClick={onClick} onPointerDown={stopDown} onPointerOver={onOver} onPointerOut={onOut}>
      <mesh
        ref={ring}
        geometry={RING}
        material={RING_MATERIAL}
        position={[0, 0.04, 0]}
        scale={Math.max(0.35, shape.hitbox[2] * shape.fit[2] * 0.7)}
        visible={false}
        raycast={() => null}
      />
      <sprite ref={icon} scale={ICON_SIZE} visible={false} raycast={noRaycast} renderOrder={10} />
      <group ref={sizer}>
        <group scale={[...shape.fit]}>
          <mesh position={[...shape.hitboxCenter]} material={HITBOX_MATERIAL}>
            <boxGeometry args={[...shape.hitbox]} />
          </mesh>
          <group ref={body}>{children(keep)}</group>
        </group>
      </group>
    </group>
  );
}

/** The procedural low-poly animal: a merged body and rigid legs that swing at the hip. */
function ProceduralAnimal({ id, kind, breed }: { id: number; kind: AnimalId; breed: BreedId }) {
  const model = animalModel(kind);
  const legs = useRef<Array<Group | null>>([]);
  const shape = useMemo((): FigureShape => {
    const hip = model.legs[0]?.[1] ?? 0.2;
    return { ...model, hip, lieDrop: hip * 0.85, bodyGraze: 0.12 };
  }, [model]);
  const limbs: Limbs = (m, k) => {
    legs.current.forEach((leg, i) => {
      if (!leg) return;
      leg.visible = !m.sleeping;
      const pairPhase = model.legs.length === 2 ? i * Math.PI : i === 0 || i === 3 ? 0 : Math.PI;
      const swing = m.walking ? Math.sin(m.phase + pairPhase) * 0.55 : 0;
      leg.rotation.x = MathUtils.lerp(leg.rotation.x, swing, k * 1.5);
    });
  };
  const material = materialFor(breed, { old: false, condition: null });
  return (
    <AnimalFigure id={id} breed={breed} shape={shape} limbs={limbs}>
      {(keep) => (
        <>
          <mesh ref={keep} geometry={model.body} material={material} castShadow receiveShadow />
          {model.legs.map((position, i) => (
            <group
              key={i}
              position={[position[0], position[1], position[2]]}
              ref={(el) => {
                legs.current[i] = el;
              }}
            >
              <mesh ref={keep} geometry={model.leg} material={material} castShadow />
            </group>
          ))}
        </>
      )}
    </AnimalFigure>
  );
}

/** An animal modeled and rigged in Blender: one skinned mesh whose bones follow the animal's state. */
function RiggedAnimal({ id, kind, breed, url }: { id: number; kind: AnimalId; breed: BreedId; url: string }) {
  const { scene } = useGLTF(url, false, false);
  const rig = useMemo(() => createRig(scene), [scene]);
  const shape = useMemo((): FigureShape => {
    const s = rigShape(kind, scene);
    // Lying down, the belly rests on the ground (the legs fold under it).
    return { ...s, lieDrop: s.hip * 0.62, bodyGraze: 0 };
  }, [kind, scene]);
  const limbs: Limbs = (m, k) => poseRig(rig, rigTargets(m), k);
  return (
    <AnimalFigure id={id} breed={breed} shape={shape} limbs={limbs}>
      {(keep) => <primitive object={rig.root} ref={() => keep(rig.mesh)} />}
    </AnimalFigure>
  );
}

for (const url of Object.values(RIGGED_ANIMALS)) useGLTF.preload(url, false, false);

function AnimalBody({ id, kind, breed }: { id: number; kind: AnimalId; breed: BreedId }) {
  const url = RIGGED_ANIMALS[kind];
  if (!url) return <ProceduralAnimal id={id} kind={kind} breed={breed} />;
  // The boxes stand in while the model loads.
  return (
    <Suspense fallback={<ProceduralAnimal id={id} kind={kind} breed={breed} />}>
      <RiggedAnimal id={id} kind={kind} breed={breed} url={url} />
    </Suspense>
  );
}

/** Farm animals, animated from the game state every frame (re-renders only when one is added or removed). */
export function Animals() {
  const list = useGameStore((s) => s.game.animals.map((a) => `${a.id}:${a.kind}:${a.breed}`).join(','));
  return (
    <group>
      {list
        .split(',')
        .filter(Boolean)
        .map((entry) => {
          const [id = '', name = '', breedName = ''] = entry.split(':');
          const kind = ANIMAL_IDS.find((k) => k === name);
          const breed = BREED_IDS.find((b) => b === breedName);
          return kind && breed ? <AnimalBody key={id} id={Number(id)} kind={kind} breed={breed} /> : null;
        })}
    </group>
  );
}
