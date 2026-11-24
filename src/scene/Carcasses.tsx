import { useGLTF } from '@react-three/drei';
import { Suspense, useMemo, type ReactNode } from 'react';
import { CircleGeometry, Color, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { ANIMAL_IDS, BREED_IDS, type AnimalId, type BreedId } from '../data/animals';
import { GRID_SIZE } from '../data/world';
import { useGameStore } from '../store/gameStore';
import { hash01 } from './coords';
import { BREED_TINTS, CARCASS_STAIN, CARCASS_TINT, animalModel } from './models/animalModels';
import { CARCASS_TARGETS, RIGGED_ANIMALS, createRig, poseRig, rigShape } from './models/riggedAnimals';

const HALF = GRID_SIZE / 2;

/** One faded material per breed. */
const materials = new Map<BreedId, MeshStandardMaterial>();
const materialFor = (breed: BreedId): MeshStandardMaterial => {
  let material = materials.get(breed);
  if (!material) {
    const color = new Color(BREED_TINTS[breed]).lerp(new Color(CARCASS_TINT), 0.35);
    material = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, color });
    materials.set(breed, material);
  }
  return material;
};

/** A dark stain on the ground under the carcass. */
const STAIN = new CircleGeometry(1, 12).rotateX(-Math.PI / 2);
const STAIN_MATERIAL = new MeshBasicMaterial({ color: CARCASS_STAIN, transparent: true, opacity: 0.4, depthWrite: false });
const noRaycast = () => null;

interface CarcassProps {
  id: number;
  kind: AnimalId;
  breed: BreedId;
  x: number;
  y: number;
}

interface CarcassLayout {
  /** World size of the figure: scale, standing height, half the flank width and length. */
  fit: readonly [number, number, number];
  height: number;
  lift: number;
  length: number;
}

/** The ground stain and the body rolled on its side (the body's up axis now points along -x). */
function CarcassPose({ id, x, y, layout, children }: { id: number; x: number; y: number; layout: CarcassLayout; children: ReactNode }) {
  const { fit, height, lift, length } = layout;
  return (
    <group position={[x - HALF, 0, y - HALF]} rotation={[0, hash01(id) * Math.PI * 2, 0]}>
      <mesh geometry={STAIN} material={STAIN_MATERIAL} position={[0, 0.015, 0]} scale={[height * 0.55, 1, length * 0.42]} raycast={noRaycast} />
      <group position={[height / 2, lift * 0.8, 0]} rotation={[0, 0, Math.PI / 2]}>
        <group scale={[...fit]}>{children}</group>
      </group>
    </group>
  );
}

/** A dead procedural animal lying on its side, until the crew takes it away. */
function CarcassFigure({ id, kind, breed, x, y }: CarcassProps) {
  const model = animalModel(kind);
  const material = materialFor(breed);
  const [fx, fy, fz] = model.fit;
  // Half the body width: how high the flank's center sits once it lies on its side.
  const layout = { fit: model.fit, height: model.height * fy, lift: (model.hitbox[0] * fx) / 2, length: model.hitbox[2] * fz };
  return (
    <CarcassPose id={id} x={x} y={y} layout={layout}>
      <mesh geometry={model.body} material={material} castShadow receiveShadow />
      {model.legs.map((p, i) => (
        <mesh key={i} geometry={model.leg} material={material} position={[p[0], p[1], p[2]]} rotation={[i % 2 ? 0.3 : -0.3, 0, 0]} />
      ))}
    </CarcassPose>
  );
}

/** A dead animal made in Blender: its own copy of the rig, posed once with the legs apart. */
function RiggedCarcass({ url, ...props }: CarcassProps & { url: string }) {
  const { scene } = useGLTF(url, false, false);
  const rig = useMemo(() => {
    const copy = createRig(scene);
    poseRig(copy, CARCASS_TARGETS, 1);
    copy.mesh.material = materialFor(props.breed);
    return copy;
  }, [scene, props.breed]);
  const shape = rigShape(props.kind, scene);
  const [s] = shape.fit;
  const layout = { fit: shape.fit, height: shape.height * s, lift: (shape.width * s) / 2, length: shape.hitbox[2] * s };
  return (
    <CarcassPose id={props.id} x={props.x} y={props.y} layout={layout}>
      <primitive object={rig.root} />
    </CarcassPose>
  );
}

function CarcassBody(props: CarcassProps) {
  const url = RIGGED_ANIMALS[props.kind];
  if (!url) return <CarcassFigure {...props} />;
  return (
    <Suspense fallback={<CarcassFigure {...props} />}>
      <RiggedCarcass {...props} url={url} />
    </Suspense>
  );
}

/** Carcasses on the ground (re-renders only when one appears or is taken away). */
export function Carcasses() {
  const list = useGameStore((s) =>
    s.game.carcasses.map((c) => `${c.id}:${c.kind}:${c.breed}:${c.x.toFixed(3)}:${c.y.toFixed(3)}`).join(','),
  );
  return (
    <group>
      {list
        .split(',')
        .filter(Boolean)
        .map((entry) => {
          const [id = '', name = '', breedName = '', x = '0', y = '0'] = entry.split(':');
          const kind = ANIMAL_IDS.find((k) => k === name);
          const breed = BREED_IDS.find((b) => b === breedName);
          if (!kind || !breed) return null;
          return <CarcassBody key={id} id={Number(id)} kind={kind} breed={breed} x={Number(x)} y={Number(y)} />;
        })}
    </group>
  );
}
