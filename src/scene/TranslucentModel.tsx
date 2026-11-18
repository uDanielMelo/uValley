import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import { Mesh, type Group, type Material } from 'three';
import { STRUCTURE_MODELS, StructureTransform, type PlacedProps } from './structureModels';

const noRaycast = () => null;

interface TranslucentProps extends PlacedProps {
  /** Fixed opacity, or a function read every frame (e.g. a site's progress). */
  opacity: number | (() => number);
}

/** Non-interactive, see-through copy of a structure model (build preview and construction sites). */
export function TranslucentModel({ type, x, y, rotation, opacity }: TranslucentProps) {
  const ref = useRef<Group>(null);
  const materials = useRef<Material[]>([]);
  const Model = STRUCTURE_MODELS[type];

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const clones: Material[] = [];
    const start = typeof opacity === 'number' ? opacity : opacity();
    root.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      obj.raycast = noRaycast;
      obj.castShadow = false;
      const source = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (!source) return;
      const clone = (source as Material).clone();
      clone.transparent = true;
      clone.opacity = start;
      clone.depthWrite = false;
      clones.push(clone);
      obj.material = clone;
    });
    materials.current = clones;
    return () => clones.forEach((m) => m.dispose());
    // Cloned once per model; later opacity changes happen in useFrame.
  }, [type]);

  useFrame(() => {
    if (typeof opacity === 'number') return;
    const value = opacity();
    for (const m of materials.current) m.opacity = value;
  });

  return (
    <group ref={ref}>
      <StructureTransform type={type} x={x} y={y} rotation={rotation}>
        <Model />
      </StructureTransform>
    </group>
  );
}
