import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, CircleGeometry, MeshBasicMaterial, type Mesh } from 'three';
import { LAMP_MATERIAL, nightState } from '../materials';
import { Block, CONCRETE, Meters, WOOD, WOOD_DARK } from './Buildings';

/**
 * Decorations and lighting, authored in meters inside <Meters> (1 tile = 3.5 m). Origin = footprint
 * center on the ground, front toward +z.
 */

const IRON = '#3b3f44';
const STONE = '#b7b0a2';
const WATER = '#5aa7d6';
const LEAF = '#4f8a35';
const LEAF_DARK = '#3f7029';
const STRAW = '#d9b45a';

/** Warm pool of light on the ground under a lamp, shown at night. */
const GLOW = new CircleGeometry(1, 24).rotateX(-Math.PI / 2);

/** Lamp post: 3.6 m iron pole with a lantern that lights up at night and a glow on the ground. */
export function LampPost() {
  const glow = useRef<Mesh>(null);
  const material = useMemo(
    () => new MeshBasicMaterial({ color: '#ffcf7a', transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }),
    [],
  );
  useFrame(() => {
    material.opacity = nightState.value * 0.28;
    if (glow.current) glow.current.visible = nightState.value > 0.05;
  });
  return (
    <Meters>
      <mesh ref={glow} geometry={GLOW} material={material} position={[0, 0.03, 0]} scale={4.5} raycast={() => null} />
      <Block position={[0, 0.15, 0]} size={[0.5, 0.3, 0.5]} color={CONCRETE} />
      <Block position={[0, 1.9, 0]} size={[0.14, 3.5, 0.14]} color={IRON} />
      <Block position={[0, 3.6, 0.25]} size={[0.1, 0.1, 0.6]} color={IRON} />
      <Block position={[0, 3.75, 0.5]} size={[0.42, 0.12, 0.42]} color={IRON} />
      <mesh position={[0, 3.48, 0.5]} material={LAMP_MATERIAL}>
        <boxGeometry args={[0.3, 0.42, 0.3]} />
      </mesh>
    </Meters>
  );
}

/** Raised flower bed with a wooden border. */
export function FlowerBed() {
  const flowers = ['#e85d75', '#f4d35e', '#ffffff', '#b07bd1', '#ff8c42'];
  return (
    <Meters>
      <Block position={[0, 0.2, 0]} size={[2.8, 0.4, 2.8]} color={WOOD} />
      <Block position={[0, 0.42, 0]} size={[2.5, 0.06, 2.5]} color="#5b3d24" />
      {Array.from({ length: 16 }, (_, i) => {
        const x = -0.9 + (i % 4) * 0.6;
        const z = -0.9 + Math.floor(i / 4) * 0.6;
        return (
          <group key={i} position={[x, 0.45, z]}>
            <Block position={[0, 0.22, 0]} size={[0.06, 0.44, 0.06]} color={LEAF} shadow={false} />
            <Block position={[0, 0.48, 0]} size={[0.22, 0.14, 0.22]} color={flowers[i % flowers.length] ?? '#ffffff'} />
          </group>
        );
      })}
    </Meters>
  );
}

/** Garden bench (1.6 m) facing +z. */
export function Bench() {
  return (
    <Meters>
      <Block position={[0, 0.45, 0]} size={[1.6, 0.08, 0.5]} color={WOOD} />
      <Block position={[0, 0.85, -0.22]} size={[1.6, 0.4, 0.06]} color={WOOD} />
      {[-0.7, 0.7].map((x) => (
        <group key={x}>
          <Block position={[x, 0.22, 0.15]} size={[0.08, 0.44, 0.08]} color={IRON} />
          <Block position={[x, 0.5, -0.2]} size={[0.08, 1.0, 0.08]} color={IRON} />
        </group>
      ))}
    </Meters>
  );
}

/** Scarecrow on a post: straw hat, checked shirt and outstretched arms. */
export function Scarecrow() {
  return (
    <Meters>
      <Block position={[0, 1.0, 0]} size={[0.12, 2.0, 0.12]} color={WOOD_DARK} />
      <Block position={[0, 1.55, 0]} size={[1.6, 0.1, 0.1]} color={WOOD_DARK} />
      <Block position={[0, 1.4, 0]} size={[0.55, 0.65, 0.3]} color="#b5523b" />
      <Block position={[0, 1.55, 0.01]} size={[1.4, 0.18, 0.2]} color="#b5523b" />
      <Block position={[0, 1.95, 0]} size={[0.32, 0.32, 0.3]} color="#e8d2a0" />
      <Block position={[0, 2.14, 0]} size={[0.7, 0.05, 0.7]} color={STRAW} />
      <Block position={[0, 2.26, 0]} size={[0.32, 0.2, 0.32]} color={STRAW} />
    </Meters>
  );
}

/** A planted shade tree (about 6 m). */
export function PlantedTree() {
  return (
    <Meters>
      <Block position={[0, 1.4, 0]} size={[0.35, 2.8, 0.35]} color="#6e4a2a" />
      <Block position={[0, 3.6, 0]} size={[2.6, 2.2, 2.6]} color={LEAF} rotation={[0, 0.4, 0]} />
      <Block position={[0.3, 4.9, -0.2]} size={[1.8, 1.4, 1.8]} color={LEAF_DARK} rotation={[0, 0.9, 0]} />
    </Meters>
  );
}

/** Stone fountain (6 m wide basin) with a two-tier column. */
export function Fountain() {
  return (
    <Meters>
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[3, 3.1, 0.7, 10]} />
        <meshStandardMaterial color={STONE} flatShading roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <cylinderGeometry args={[2.7, 2.7, 0.1, 10]} />
        <meshStandardMaterial color={WATER} flatShading roughness={0.2} metalness={0.1} />
      </mesh>
      <mesh position={[0, 1.4, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.4, 1.8, 8]} />
        <meshStandardMaterial color={STONE} flatShading />
      </mesh>
      <mesh position={[0, 2.3, 0]} castShadow>
        <cylinderGeometry args={[1.1, 0.5, 0.35, 10]} />
        <meshStandardMaterial color={STONE} flatShading />
      </mesh>
      <mesh position={[0, 2.5, 0]}>
        <cylinderGeometry args={[0.95, 0.95, 0.06, 10]} />
        <meshStandardMaterial color={WATER} flatShading roughness={0.2} />
      </mesh>
      <mesh position={[0, 2.9, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, 0.8, 6]} />
        <meshStandardMaterial color={STONE} flatShading />
      </mesh>
    </Meters>
  );
}
