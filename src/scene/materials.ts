import { MeshStandardMaterial } from 'three';

/**
 * Shared materials whose look depends on the time of day.
 * DayNightLight drives them every frame, so every model using them lights up at night.
 */
export const WINDOW_MATERIAL = new MeshStandardMaterial({
  color: '#9fc4d8',
  emissive: '#ffb45a',
  emissiveIntensity: 0,
  roughness: 0.25,
  metalness: 0.1,
  flatShading: true,
});

export const LAMP_MATERIAL = new MeshStandardMaterial({
  color: '#fff1c9',
  emissive: '#ffcf7a',
  emissiveIntensity: 0,
  flatShading: true,
});

/** 0 by day, 1 at night: read by models that need it inside their own useFrame. */
export const nightState = { value: 0 };
