import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  type Group,
  type PointsMaterial,
  ShaderMaterial,
  Vector3,
} from 'three';
import { hash01 } from './coords';

/** Sky uniforms, written by DayNightLight every frame. */
export const skyUniforms = {
  uTop: { value: new Color('#5fa8e6') },
  uHorizon: { value: new Color('#cfe6f2') },
  uSunDir: { value: new Vector3(0, 1, 0) },
  uSunColor: { value: new Color('#fff1d6') },
  uSunGlow: { value: 1 },
  uStars: { value: 0 },
};

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = clip.xyww; // always on the far plane
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunGlow;
  varying vec3 vDir;
  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
    float s = max(dot(dir, normalize(uSunDir)), 0.0);
    col += uSunColor * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.12) * uSunGlow;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const STAR_COUNT = 700;

const starGeometry = (): BufferGeometry => {
  const positions: number[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const azimuth = hash01(i * 3 + 11) * Math.PI * 2;
    const elevation = Math.asin(0.08 + hash01(i * 5 + 7) * 0.92);
    const r = 250;
    positions.push(
      Math.cos(azimuth) * Math.cos(elevation) * r,
      Math.sin(elevation) * r,
      Math.sin(azimuth) * Math.cos(elevation) * r,
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
};

/** Gradient sky dome with a sun glow and night stars, centered on the camera. */
export function Sky() {
  const group = useRef<Group>(null);
  const stars = useRef<PointsMaterial>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: skyUniforms,
        vertexShader,
        fragmentShader,
        side: BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  );
  const starsGeometry = useMemo(starGeometry, []);

  useFrame(({ camera }) => {
    group.current?.position.copy(camera.position);
    if (stars.current) {
      stars.current.opacity = skyUniforms.uStars.value;
      stars.current.visible = skyUniforms.uStars.value > 0.01;
    }
  });

  return (
    <group ref={group}>
      <mesh material={material} renderOrder={-10} frustumCulled={false} raycast={() => null}>
        <sphereGeometry args={[300, 32, 16]} />
      </mesh>
      <points geometry={starsGeometry} frustumCulled={false} renderOrder={-9} raycast={() => null}>
        <pointsMaterial
          ref={stars}
          color="#ffffff"
          size={1.6}
          sizeAttenuation={false}
          transparent
          depthWrite={false}
          fog={false}
          blending={AdditiveBlending}
        />
      </points>
    </group>
  );
}
