import { useFrame } from '@react-three/fiber';
import type { Material, WebGLProgramParametersWithUniforms } from 'three';

/** Shared wind clock: one uniform object referenced by every swaying material. */
const windTime = { value: 0 };

/**
 * Adds a gentle wind sway to a material: vertices bend horizontally in proportion to their
 * local height, with a phase taken from the instance (or object) position so neighbours differ.
 */
export const applyWind = (material: Material, strength: number): void => {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uWindTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 anchor = vec3(0.0);
          #ifdef USE_INSTANCING
            anchor = instanceMatrix[3].xyz;
          #endif
          anchor += modelMatrix[3].xyz;
          float phase = anchor.x * 0.35 + anchor.z * 0.27;
          float bend = max(position.y, 0.0) * ${strength.toFixed(4)};
          float gust = 0.6 + 0.4 * sin(uWindTime * 0.37 + anchor.x * 0.05);
          transformed.x += sin(uWindTime * 1.7 + phase) * bend * gust;
          transformed.z += cos(uWindTime * 1.3 + phase * 1.3) * bend * 0.6 * gust;
        }`,
      );
  };
  // Materials sharing the same program must share the cache key.
  material.customProgramCacheKey = () => `wind-${strength}`;
};

/** Advances the wind clock. Mount once inside the Canvas. */
export function WindClock() {
  useFrame((_, delta) => {
    windTime.value += Math.min(delta, 0.1);
  });
  return null;
}
