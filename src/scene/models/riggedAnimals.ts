import { Bone, Box3, Quaternion, SkinnedMesh, Vector3, type Object3D } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AnimalId } from '../../data/animals';
import { ANIMAL_MIN_HITBOX, ANIMAL_SIZES, meters } from '../../data/scale';

/**
 * Animals drawn from a rigged glTF made in Blender (`scripts/blender/<kind>.py`) instead of the
 * procedural boxes. The file carries the skinned mesh and its bones but no animation: the game
 * turns the bones every frame (`poseRig`), so walking, grazing and lying down follow the animal's
 * state. Every rig uses the same bone names (see `BONES` in the Blender script):
 * spine, neck, head, tail1, tail2 and `<leg>_upper` / `<leg>_lower` for each leg in `LEG_IDS`.
 */
export const RIGGED_ANIMALS: Partial<Record<AnimalId, string>> = {
  cow: `${import.meta.env.BASE_URL}models/cow.glb`,
};

/** Front left, front right, hind left, hind right. */
export const LEG_IDS = ['fl', 'fr', 'hl', 'hr'] as const;
type LegId = (typeof LEG_IDS)[number];

type Vec3 = [number, number, number];

interface RigBone {
  bone: Bone;
  rest: Quaternion;
  /** The animal's side axis (pitch: legs swing, head nods) in the bone's own frame. */
  pitchAxis: Vector3;
  /** The animal's forward axis (roll: the tail sways) in the bone's own frame. */
  rollAxis: Vector3;
  pitch: number;
  roll: number;
}

/** One animal's copy of the model, with its own skeleton. */
export interface Rig {
  root: Object3D;
  mesh: SkinnedMesh;
  bones: Map<string, RigBone>;
}

const SIDE = new Vector3(1, 0, 0);
const FORWARD = new Vector3(0, 0, 1);

/** Clones the loaded model (skeleton included) and finds each bone's axes. */
export const createRig = (source: Object3D): Rig => {
  const root = clone(source);
  root.updateMatrixWorld(true);
  const meshes: SkinnedMesh[] = [];
  const bones = new Map<string, RigBone>();
  const world = new Quaternion();
  root.traverse((object) => {
    if (object instanceof SkinnedMesh) meshes.push(object);
    if (object instanceof Bone) {
      const toBone = object.getWorldQuaternion(world).invert();
      bones.set(object.name, {
        bone: object,
        rest: object.quaternion.clone(),
        pitchAxis: SIDE.clone().applyQuaternion(toBone).normalize(),
        rollAxis: FORWARD.clone().applyQuaternion(toBone).normalize(),
        pitch: 0,
        roll: 0,
      });
    }
  });
  const skinned = meshes[0];
  if (!skinned) throw new Error('rigged animal without a skinned mesh');
  // The file has no normals (flat shading does not need them, and they triple the vertices), but
  // the lights and the shadow bias do: compute smooth ones once on the shared geometry.
  if (!skinned.geometry.getAttribute('normal')) skinned.geometry.computeVertexNormals();
  skinned.castShadow = true;
  skinned.receiveShadow = true;
  // Clicks hit the figure's box instead (raycasting a skinned mesh skins every vertex on the CPU).
  skinned.raycast = () => {};
  return { root, mesh: skinned, bones };
};

/** Target [pitch, roll] in radians per bone; bones left out go back to rest. */
export type RigTargets = Partial<Record<string, readonly [number, number]>>;

const pitchTurn = new Quaternion();
const rollTurn = new Quaternion();

/** Moves every bone a fraction `k` (0–1) of the way to its target. */
export const poseRig = (rig: Rig, targets: RigTargets, k: number): void => {
  for (const [name, b] of rig.bones) {
    const [pitch, roll] = targets[name] ?? [0, 0];
    b.pitch += (pitch - b.pitch) * k;
    b.roll += (roll - b.roll) * k;
    b.bone.quaternion
      .copy(b.rest)
      .multiply(pitchTurn.setFromAxisAngle(b.pitchAxis, b.pitch))
      .multiply(rollTurn.setFromAxisAngle(b.rollAxis, b.roll));
  }
};

/** What the animal is doing this frame. */
export interface Motion {
  /** Gait phase (radians), advanced by the distance walked. */
  phase: number;
  /** Animation clock in seconds (scaled by the game speed). */
  time: number;
  walking: boolean;
  sleeping: boolean;
  grazing: boolean;
  sick: boolean;
}

// Pose angles in radians. Positive pitch swings a leg back and lowers the neck and head.
const SWING = 0.45;
const FRONT_KNEE = 0.9;
const HIND_HOCK = 0.7;
const LYING: Record<LegId, readonly [number, number]> = { fl: [-1.3, 2.6], fr: [-1.3, 2.6], hl: [-1.4, 2.4], hr: [-1.4, 2.4] };
const GRAZE = { neck: 1.2, head: -0.4 };
const SICK = { neck: 0.45, head: 0.25 };

/** Bone targets for a four-legged rig. */
export const rigTargets = (m: Motion): RigTargets => {
  const t: Record<string, readonly [number, number]> = {};
  const sway = Math.sin(m.time * 1.3) * (m.walking ? 0.2 : 0.12);
  t.tail1 = [0.05, sway * 0.5];
  t.tail2 = [0.05, Math.sin(m.time * 1.3 - 0.8) * (m.walking ? 0.35 : 0.22)];
  if (m.sleeping) {
    for (const leg of LEG_IDS) {
      const [upper, lower] = LYING[leg];
      t[`${leg}_upper`] = [upper, 0];
      t[`${leg}_lower`] = [lower, 0];
    }
    t.neck = [0.15, 0];
    return t;
  }
  for (const leg of LEG_IDS) {
    // Diagonal pairs step together; a leg lifts (bends) while it swings forward.
    const a = m.phase + (leg === 'fl' || leg === 'hr' ? 0 : Math.PI);
    const lift = m.walking ? Math.max(0, -Math.cos(a)) : 0;
    t[`${leg}_upper`] = [m.walking ? Math.sin(a) * SWING : 0, 0];
    t[`${leg}_lower`] = [leg[0] === 'f' ? lift * FRONT_KNEE : -lift * HIND_HOCK, 0];
  }
  const head = m.sick ? SICK : m.grazing ? GRAZE : { neck: Math.sin(m.time * 0.8) * 0.05, head: 0 };
  t.neck = [head.neck, 0];
  t.head = [head.head, 0];
  return t;
};

/** A dead animal: legs a little apart, neck stretched out. */
export const CARCASS_TARGETS: RigTargets = {
  fl_upper: [-0.35, 0],
  fr_upper: [-0.2, 0],
  hl_upper: [0.35, 0],
  hr_upper: [0.2, 0],
  neck: [-0.2, 0],
  head: [-0.3, 0],
};

/** Size of a rigged model in the world, like `FittedAnimalModel` for the procedural ones. */
export interface RigShape {
  /** Uniform scale [s, s, s] from meters in the file to the species' real height. */
  fit: Vec3;
  worldHeight: number;
  /** Top of the model and its width, in model units (meters). */
  height: number;
  width: number;
  /** Clickable box size and center in model units. */
  hitbox: Vec3;
  hitboxCenter: Vec3;
  /** Hip height in model units (gait length and how far the body sinks lying down). */
  hip: number;
}

const shapes = new Map<AnimalId, RigShape>();

/** Measures the loaded model once per species. */
export const rigShape = (kind: AnimalId, source: Object3D): RigShape => {
  const cached = shapes.get(kind);
  if (cached) return cached;
  source.updateMatrixWorld(true);
  const box = new Box3().setFromObject(source);
  const height = box.max.y;
  const width = box.max.x - box.min.x;
  const length = box.max.z - box.min.z;
  const s = meters(ANIMAL_SIZES[kind].height) / height;
  const minBox = meters(ANIMAL_MIN_HITBOX) / s;
  const hipBone = source.getObjectByName('fl_upper');
  const hip = hipBone ? hipBone.getWorldPosition(new Vector3()).y : height * 0.6;
  const shape: RigShape = {
    fit: [s, s, s],
    worldHeight: height * s,
    height,
    width,
    hitbox: [Math.max(width, minBox), Math.max(height, minBox), Math.max(length, minBox)],
    hitboxCenter: [0, Math.max(height, minBox) / 2, (box.max.z + box.min.z) / 2],
    hip,
  };
  shapes.set(kind, shape);
  return shape;
};
