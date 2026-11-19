import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { MeshStandardMaterial, type BufferGeometry, type InstancedMesh, type Matrix4 } from 'three';
import { addSeasonal } from './season';
import { applyWind } from './wind';

const noRaycast = () => null;

interface InstancedPropsProps {
  geometry: BufferGeometry;
  matrices: readonly Matrix4[];
  /** Capacity of the InstancedMesh; defaults to matrices.length. Use a fixed max for dynamic sets. */
  capacity?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Wind sway strength (0 = static). */
  wind?: number;
  /** Tinted by the season (landscape props). */
  seasonal?: boolean;
}

/** A vertex-colored, flat-shaded InstancedMesh filled from a list of matrices. Not raycastable. */
export function InstancedProps({
  geometry,
  matrices,
  capacity,
  castShadow = false,
  receiveShadow = true,
  wind = 0,
  seasonal = false,
}: InstancedPropsProps) {
  const ref = useRef<InstancedMesh>(null);
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
    if (wind > 0) applyWind(m, wind);
    return m;
  }, [wind]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => (seasonal ? addSeasonal(material) : undefined), [material, seasonal]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const count = Math.min(matrices.length, mesh.instanceMatrix.count);
    for (let i = 0; i < count; i++) {
      const m = matrices[i];
      if (m) mesh.setMatrixAt(i, m);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, Math.max(1, capacity ?? matrices.length)]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      raycast={noRaycast}
    />
  );
}
