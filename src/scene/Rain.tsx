import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, Color, Matrix4, MeshBasicMaterial, type InstancedMesh } from 'three';
import { WEATHERS } from '../data/climate';
import { dayOf, seasonOf, weatherAt } from '../game/climate';
import { useGameStore } from '../store/gameStore';
import { hash01 } from './coords';
import { PALETTE } from './palette';

const noRaycast = () => null;
/** Drops in a storm; light rain shows a share of them. */
const MAX_DROPS = 1800;
const RAIN_SHARE = 0.55;
/** Box of rain around the camera's ground point (world units). */
const SPREAD = 36;
const HEIGHT = 16;
/** Fall speed (world units per real second). */
const FALL = 22;
const DROP = new BoxGeometry(0.012, 0.42, 0.012);
/** Snow falls slowly, as small flakes (the drop squashed into a speck). */
const SNOW_FALL = 3.2;
const RAIN_COLOR = new Color(PALETTE.rain);
const SNOW_COLOR = new Color(PALETTE.snow);

/** Falling rain around the view on rainy and stormy days (snow in winter; nothing on dry days). */
export function Rain() {
  const ref = useRef<InstancedMesh>(null);
  const material = useMemo(
    () => new MeshBasicMaterial({ color: PALETTE.rain, transparent: true, opacity: 0.45, depthWrite: false, fog: true }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  // Each drop's fixed offset in the rain box.
  const drops = useMemo(
    () =>
      Array.from({ length: MAX_DROPS }, (_, i) => ({
        x: (hash01(i * 3 + 1) - 0.5) * SPREAD,
        z: (hash01(i * 7 + 2) - 0.5) * SPREAD,
        y: hash01(i * 11 + 3) * HEIGHT,
      })),
    [],
  );
  const matrix = useMemo(() => new Matrix4(), []);
  const clock = useRef(0);

  useFrame(({ camera }, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    const minutes = useGameStore.getState().game.gameMinutes;
    const weather = WEATHERS[weatherAt(minutes)];
    mesh.visible = weather.waters;
    if (!mesh.visible) return;
    const snow = seasonOf(dayOf(minutes)) === 'winter';
    material.color.copy(snow ? SNOW_COLOR : RAIN_COLOR);
    material.opacity = snow ? 0.9 : 0.45;
    clock.current += Math.min(delta, 0.1);
    const count = weather.id === 'storm' ? MAX_DROPS : Math.floor(MAX_DROPS * RAIN_SHARE);
    // Centered under the camera, a little ahead of it.
    const cx = camera.position.x * 0.8;
    const cz = camera.position.z * 0.8;
    const slant = weather.id === 'storm' ? 0.25 : 0.08;
    for (let i = 0; i < count; i++) {
      const d = drops[i];
      if (!d) continue;
      if (snow) {
        const y = HEIGHT - ((d.y + clock.current * SNOW_FALL) % HEIGHT);
        const sway = Math.sin(clock.current * 1.3 + i) * 0.25;
        matrix.makeScale(4, 0.12, 4).setPosition(cx + d.x + sway, y, cz + d.z);
      } else {
        const y = HEIGHT - ((d.y + clock.current * FALL) % HEIGHT);
        matrix.makeRotationZ(slant).setPosition(cx + d.x + y * slant * 0.3, y, cz + d.z);
      }
      mesh.setMatrixAt(i, matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={ref}
      args={[DROP, material, MAX_DROPS]}
      frustumCulled={false}
      raycast={noRaycast}
      visible={false}
      renderOrder={4}
    />
  );
}
