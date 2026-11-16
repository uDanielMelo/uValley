import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { ExtrudeGeometry, Shape, Vector2, type Material, type PointLight } from 'three';
import { LAMP_MATERIAL, WINDOW_MATERIAL, nightState } from '../materials';

type Vec3 = [number, number, number];

interface PartProps {
  position: Vec3;
  size: Vec3;
  color?: string;
  material?: Material;
  rotation?: Vec3;
  shadow?: boolean;
}

function Part({ position, size, color, material, rotation, shadow = true }: PartProps) {
  return (
    <mesh position={position} rotation={rotation} castShadow={shadow} receiveShadow material={material}>
      <boxGeometry args={size} />
      {!material && <meshStandardMaterial color={color} flatShading roughness={0.85} />}
    </mesh>
  );
}

const WALL = '#f3e7cf';
const WALL_SHADE = '#e6d6b8';
const TRIM = '#fbf8f1';
const ROOF = '#a9443a';
const ROOF_DARK = '#8f372f';
const DOOR = '#7a4b2a';
const STONE = '#a29b8c';
const STONE_DARK = '#857f72';
const WOOD = '#a0723f';
const FLOWER_RED = '#e0503a';
const FLOWER_YELLOW = '#f2c84b';
const LEAF = '#4f8a35';

// Main body (origin = center of the 2x2 footprint).
const BASE = 0.15;
const WALL_H = 1.25;
const WALL_W = 1.7;
const WALL_D = 1.3;
const WALL_Z = -0.15;
const FRONT = WALL_Z + WALL_D / 2;
const BACK = WALL_Z - WALL_D / 2;
const TOP = BASE + WALL_H;
const PITCH = 0.62;
const OVERHANG = 0.16;

/** A framed window on a wall facing +z (rotate the group for other walls). */
function Window({ position, rotationY = 0 }: { position: Vec3; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Part position={[0, 0, 0]} size={[0.42, 0.44, 0.05]} color={TRIM} shadow={false} />
      <Part position={[0, 0, 0.02]} size={[0.32, 0.34, 0.03]} material={WINDOW_MATERIAL} shadow={false} />
      <Part position={[0, 0, 0.04]} size={[0.03, 0.34, 0.02]} color={TRIM} shadow={false} />
      <Part position={[0, 0, 0.04]} size={[0.32, 0.03, 0.02]} color={TRIM} shadow={false} />
      <Part position={[0, -0.26, 0.05]} size={[0.46, 0.05, 0.1]} color={TRIM} />
    </group>
  );
}

function FlowerBox({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <Part position={[0, 0, 0]} size={[0.4, 0.09, 0.1]} color={WOOD} />
      {[-0.14, -0.05, 0.05, 0.14].map((x, i) => (
        <Part
          key={x}
          position={[x, 0.07, 0]}
          size={[0.06, 0.06, 0.06]}
          color={i % 2 ? FLOWER_YELLOW : FLOWER_RED}
          shadow={false}
        />
      ))}
      <Part position={[0, 0.05, 0]} size={[0.36, 0.04, 0.07]} color={LEAF} shadow={false} />
    </group>
  );
}

/** Porch lamp: a warm light that fades in at night. */
function PorchLamp({ position }: { position: Vec3 }) {
  const light = useRef<PointLight>(null);
  useFrame(() => {
    if (light.current) light.current.intensity = nightState.value > 0.4 ? (nightState.value - 0.4) * 5 : 0;
  });
  return (
    <group position={position}>
      <Part position={[0, 0, 0]} size={[0.09, 0.13, 0.09]} material={LAMP_MATERIAL} shadow={false} />
      <Part position={[0, 0.08, 0]} size={[0.12, 0.03, 0.12]} color={STONE_DARK} shadow={false} />
      <pointLight ref={light} position={[0, -0.05, 0.25]} color="#ffbf6b" distance={5} decay={2} intensity={0} />
    </group>
  );
}

/**
 * Family farmhouse built from primitives: stone base, porch facing +z, gabled roof, chimney.
 * Origin = center of its 2x2 footprint, y = 0 on the ground.
 * To swap for a glTF later, render `<primitive object={useGLTF(url).scene} />` here instead.
 */
export function House() {
  const gable = useMemo(() => {
    const rise = (WALL_D / 2) * Math.tan(PITCH);
    const shape = new Shape([new Vector2(-WALL_D / 2, 0), new Vector2(WALL_D / 2, 0), new Vector2(0, rise)]);
    const geometry = new ExtrudeGeometry(shape, { depth: WALL_W, bevelEnabled: false });
    geometry.translate(0, 0, -WALL_W / 2);
    geometry.rotateY(Math.PI / 2);
    return geometry;
  }, []);

  const half = WALL_D / 2 + OVERHANG;
  const slabLength = half / Math.cos(PITCH) + 0.04;
  const rise = half * Math.tan(PITCH);
  const slabY = TOP - OVERHANG * Math.tan(PITCH) + rise / 2 + 0.05;
  const roofWidth = WALL_W + OVERHANG * 2;

  return (
    <group>
      {/* Stone foundation and porch deck */}
      <Part position={[0, BASE / 2, WALL_Z]} size={[WALL_W + 0.12, BASE, WALL_D + 0.12]} color={STONE} />
      <Part position={[0, BASE - 0.02, FRONT + 0.24]} size={[WALL_W + 0.1, 0.08, 0.5]} color={WOOD} />
      <Part position={[0.25, 0.06, FRONT + 0.58]} size={[0.5, 0.12, 0.2]} color={STONE_DARK} />

      {/* Walls with a darker skirting band */}
      <Part position={[0, BASE + WALL_H / 2, WALL_Z]} size={[WALL_W, WALL_H, WALL_D]} color={WALL} />
      <Part position={[0, BASE + 0.12, WALL_Z]} size={[WALL_W + 0.02, 0.24, WALL_D + 0.02]} color={WALL_SHADE} />
      {/* Corner trims */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Part
            key={`${sx}${sz}`}
            position={[(sx * WALL_W) / 2, BASE + WALL_H / 2, WALL_Z + (sz * WALL_D) / 2]}
            size={[0.07, WALL_H, 0.07]}
            color={TRIM}
          />
        )),
      )}

      {/* Gabled roof */}
      <mesh geometry={gable} position={[0, TOP, WALL_Z]} castShadow receiveShadow>
        <meshStandardMaterial color={WALL} flatShading roughness={0.85} />
      </mesh>
      <Part
        position={[0, slabY, WALL_Z + half / 2]}
        size={[roofWidth, 0.09, slabLength]}
        color={ROOF}
        rotation={[PITCH, 0, 0]}
      />
      <Part
        position={[0, slabY, WALL_Z - half / 2]}
        size={[roofWidth, 0.09, slabLength]}
        color={ROOF_DARK}
        rotation={[-PITCH, 0, 0]}
      />
      <Part position={[0, TOP + rise - OVERHANG * Math.tan(PITCH) + 0.1, WALL_Z]} size={[roofWidth, 0.07, 0.12]} color={ROOF_DARK} />

      {/* Chimney */}
      <Part position={[0.5, TOP + 0.55, WALL_Z - 0.3]} size={[0.26, 1.0, 0.26]} color={STONE} />
      <Part position={[0.5, TOP + 1.07, WALL_Z - 0.3]} size={[0.32, 0.06, 0.32]} color={STONE_DARK} />

      {/* Porch: posts, rail and a lean-to roof */}
      {[-0.8, -0.25, 0.8].map((x) => (
        <Part key={x} position={[x, BASE + 0.48, FRONT + 0.44]} size={[0.07, 0.95, 0.07]} color={TRIM} />
      ))}
      <Part position={[-0.52, BASE + 0.28, FRONT + 0.44]} size={[0.55, 0.05, 0.04]} color={TRIM} />
      <Part position={[0, BASE + 1.0, FRONT + 0.3]} size={[WALL_W + 0.2, 0.06, 0.66]} color={ROOF} rotation={[0.28, 0, 0]} />

      {/* Front: door, window, lamp, flower box */}
      <Part position={[0.25, BASE + 0.34, FRONT + 0.01]} size={[0.4, 0.68, 0.04]} color={TRIM} shadow={false} />
      <Part position={[0.25, BASE + 0.33, FRONT + 0.03]} size={[0.32, 0.62, 0.03]} color={DOOR} shadow={false} />
      <Part position={[0.36, BASE + 0.33, FRONT + 0.05]} size={[0.04, 0.04, 0.03]} color={FLOWER_YELLOW} shadow={false} />
      <Window position={[-0.45, BASE + 0.72, FRONT + 0.01]} />
      <FlowerBox position={[-0.45, BASE + 0.42, FRONT + 0.08]} />
      <PorchLamp position={[-0.05, BASE + 0.82, FRONT + 0.06]} />

      {/* Sides and back */}
      <Window position={[WALL_W / 2 + 0.01, BASE + 0.72, WALL_Z - 0.25]} rotationY={Math.PI / 2} />
      <Window position={[WALL_W / 2 + 0.01, BASE + 0.72, WALL_Z + 0.3]} rotationY={Math.PI / 2} />
      <Window position={[-WALL_W / 2 - 0.01, BASE + 0.72, WALL_Z]} rotationY={-Math.PI / 2} />
      <Window position={[-0.45, BASE + 0.72, BACK - 0.01]} rotationY={Math.PI} />
      <Window position={[0.45, BASE + 0.72, BACK - 0.01]} rotationY={Math.PI} />
      {/* Attic window in the east gable (the ridge runs along x) */}
      <group scale={0.65}>
        <Window position={[(WALL_W / 2 + 0.01) / 0.65, (TOP + 0.17) / 0.65, WALL_Z / 0.65]} rotationY={Math.PI / 2} />
      </group>
    </group>
  );
}
