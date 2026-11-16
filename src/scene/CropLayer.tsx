import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Euler, Matrix4, MeshStandardMaterial, Quaternion, Vector3, type InstancedMesh } from 'three';
import { CROP_IDS, CROP_STAGE_COUNT, type CropId } from '../data/crops';
import { cropStage } from '../game/crops';
import { TILE_COUNT } from '../game/grid';
import { useGameStore } from '../store/gameStore';
import { hash01, indexToWorld } from './coords';
import { CROP_MODELS } from './models/cropModels';
import { applyWind } from './wind';

const noRaycast = () => null;

interface CropInstancesProps {
  cropId: CropId;
  stage: number;
}

/** One InstancedMesh per (crop, stage), filled from the tiles that match it. */
function CropInstances({ cropId, stage }: CropInstancesProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const tiles = useGameStore((s) => s.game.tiles);
  const geometry = useMemo(() => CROP_MODELS[cropId](stage), [cropId, stage]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    applyWind(m, stage === 0 ? 0.2 : 0.12);
    return m;
  }, [stage]);
  useEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    const pos = new Vector3();
    const scale = new Vector3();
    let count = 0;
    tiles.forEach((tile, i) => {
      if (!tile.crop || tile.crop.cropId !== cropId || cropStage(tile.crop) !== stage) return;
      const [x, z] = indexToWorld(i);
      const s = 0.9 + hash01(i) * 0.2;
      q.setFromEuler(e.set(0, hash01(i + 999) * Math.PI * 2, 0));
      m.compose(pos.set(x, 0, z), q, scale.set(s, s, s));
      mesh.setMatrixAt(count++, m);
    });
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [tiles, cropId, stage]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, TILE_COUNT]}
      castShadow
      receiveShadow
      raycast={noRaycast}
    />
  );
}

const STAGES = Array.from({ length: CROP_STAGE_COUNT }, (_, i) => i);

export function CropLayer() {
  return (
    <group>
      {CROP_IDS.flatMap((cropId) =>
        STAGES.map((stage) => <CropInstances key={`${cropId}-${stage}`} cropId={cropId} stage={stage} />),
      )}
    </group>
  );
}
