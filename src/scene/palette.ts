/** Visual colors for the procedural low-poly art (sRGB hex). */
export const PALETTE = {
  // Grass: two tones blended with low-frequency noise, plus a dry tint for variety.
  grassA: '#7cab45',
  grassB: '#97bd52',
  grassDry: '#b4b860',
  /** Land for sale: same grass, a bit darker and duller. */
  lockedTint: '#5f7a3e',
  // Soil
  tilled: '#9a6a3f',
  furrow: '#8a5a33',
  planted: '#835632',
  watered: '#5a3a22',
  /** Packed dirt under structures. */
  structureGround: '#b08a5c',
  /** Packed dirt road. */
  road: '#a88d66',
  // Outside the farm
  ground: '#6f9a3e',
  groundDark: '#557f33',
  groundLight: '#9cb653',
  // Decoration
  fence: '#d6b07a',
  fencePost: '#9a7044',
  trunk: '#6b4a2b',
  foliageA: '#5e9a3a',
  foliageB: '#78b047',
  foliageC: '#8fbf55',
  pineA: '#2f6b3a',
  pineB: '#3d7d40',
  bush: '#4f8a35',
  rock: '#a8a294',
  rockDark: '#8a857a',
  grassBlade: '#a3cc5f',
  grassBladeDark: '#86b84b',
  flowerWhite: '#f4f1e6',
  flowerYellow: '#f2d045',
  flowerPurple: '#b58ad8',
  // Interaction overlays
  hoverValid: '#fff6c2',
  hoverInvalid: '#ff6b5a',
  plotAvailable: '#ffd75e',
  plotBlocked: '#ff6b5a',
  // Task markers, by tool
  taskHoe: '#c98a4b',
  taskSeed: '#7fd35a',
  taskWater: '#5ab4f0',
  taskHand: '#ffd23f',
} as const;
