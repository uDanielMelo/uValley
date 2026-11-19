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
  /** Paved highway beyond the farm and its painted lines. */
  asphalt: '#4a4a4f',
  highwayEdgeLine: '#e8e6df',
  highwayCenterLine: '#e9c03a',
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
  /** Area selection that will cancel the queued orders under it. */
  hoverCancel: '#ffa53a',
  plotAvailable: '#ffd75e',
  plotBlocked: '#ff6b5a',
  // Task markers, by tool
  taskHoe: '#c98a4b',
  taskSeed: '#7fd35a',
  taskWater: '#5ab4f0',
  taskHand: '#ffd23f',
  taskFertilize: '#a0632f',
  /** Landscape tint per season (multiplies vertex colors). */
  seasonSpring: '#ffffff',
  seasonSummer: '#fff3d2',
  seasonAutumn: '#f6c88c',
  seasonWinter: '#cfd9de',
  rain: '#b9d2e6',
  snow: '#ffffff',
  /** Fertilized soil is darkened toward this. */
  fertilizedSoil: '#3b2614',
  /** Road being opened, and road being removed. */
  taskRoad: '#e0a45a',
  taskRoadRemove: '#ff6b5a',
  // Construction sites
  siteGround: '#8a6a48',
  scaffold: '#c9a26b',
  lumber: '#b98a55',
  progressBack: '#3b2a1a',
  progressBuild: '#7fd35a',
  progressDemolish: '#ff6b5a',
  /** Outline of the selected structure. */
  selection: '#ffd23f',
  // Product badge over shelters
  badgeFill: '#f6ecd2',
  badgeBorder: '#8a6a48',
  badgeText: '#4a3424',
} as const;
