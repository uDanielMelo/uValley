/** The town scene: its shops, where they stand and what each one opens. */

export const CITY_SHOP_IDS = ['market', 'agro', 'vet', 'registry', 'animals', 'jobs', 'dealer', 'machines'] as const;
export type CityShopId = (typeof CITY_SHOP_IDS)[number];

/** What clicking a shop opens. */
export type CityShopAction =
  | { panel: 'market' | 'garage' | 'machines' | 'workers' }
  | { panel: 'shop'; tab: 'seeds' | 'animals' | 'medicine' | 'land' };

export interface CityShopDef {
  id: CityShopId;
  label: string;
  /** What it sells or does (pt-BR), for the hover hint. */
  hint: string;
  /** Building size in meters. */
  size: { width: number; depth: number; height: number };
  /** Center of the building in meters ([x, z]); the street runs along x at z = 0. */
  position: [number, number];
  /** Side of the street it faces: north-side shops face south (+z), south-side shops face north. */
  facing: 'south' | 'north';
  roof: 'flat' | 'gable';
  wall: string;
  trim: string;
  accent: string;
  action: CityShopAction;
}

export const CITY_SHOPS: Record<CityShopId, CityShopDef> = {
  market: {
    id: 'market',
    label: 'Mercado',
    hint: 'Preços da cidade e pedidos das lojas',
    size: { width: 14, depth: 9, height: 5 },
    position: [-14, -12],
    facing: 'south',
    roof: 'flat',
    wall: '#e9d8b4',
    trim: '#8a5a34',
    accent: '#c0392b',
    action: { panel: 'market' },
  },
  agro: {
    id: 'agro',
    label: 'Casa agrícola',
    hint: 'Sementes e adubo',
    size: { width: 10, depth: 8, height: 4.5 },
    position: [3, -11.5],
    facing: 'south',
    roof: 'gable',
    wall: '#cfe0b8',
    trim: '#4f6b3a',
    accent: '#4f8a35',
    action: { panel: 'shop', tab: 'seeds' },
  },
  vet: {
    id: 'vet',
    label: 'Veterinária',
    hint: 'Remédios para os animais',
    size: { width: 8, depth: 7, height: 4 },
    position: [17, -11],
    facing: 'south',
    roof: 'flat',
    wall: '#dfe9f0',
    trim: '#5a7d99',
    accent: '#2e6da4',
    action: { panel: 'shop', tab: 'medicine' },
  },
  registry: {
    id: 'registry',
    label: 'Cartório',
    hint: 'Comprar terrenos',
    size: { width: 9, depth: 8, height: 5.5 },
    position: [31, -11.5],
    facing: 'south',
    roof: 'gable',
    wall: '#efe6d2',
    trim: '#6b5b4b',
    accent: '#7a5c9e',
    action: { panel: 'shop', tab: 'land' },
  },
  animals: {
    id: 'animals',
    label: 'Feira de animais',
    hint: 'Comprar animais',
    size: { width: 14, depth: 9, height: 4 },
    position: [-14, 12],
    facing: 'north',
    roof: 'gable',
    wall: '#d9b07a',
    trim: '#8a5a34',
    accent: '#b5523b',
    action: { panel: 'shop', tab: 'animals' },
  },
  jobs: {
    id: 'jobs',
    label: 'Agência de empregos',
    hint: 'Contratar trabalhadores',
    size: { width: 10, depth: 8, height: 5 },
    position: [4, 11.5],
    facing: 'north',
    roof: 'flat',
    wall: '#f0e0c8',
    trim: '#5e3b1f',
    accent: '#e9a23a',
    action: { panel: 'workers' },
  },
  dealer: {
    id: 'dealer',
    label: 'Concessionária',
    hint: 'Contratar e escolher o veículo do frete',
    size: { width: 12, depth: 9, height: 4.5 },
    position: [21, 12],
    facing: 'north',
    roof: 'flat',
    wall: '#e4e7ea',
    trim: '#3d454b',
    accent: '#2e6da4',
    action: { panel: 'garage' },
  },
  machines: {
    id: 'machines',
    label: 'Revenda de máquinas',
    hint: 'Comprar e alugar trator e colheitadeira',
    size: { width: 13, depth: 9, height: 5.5 },
    position: [38, 12],
    facing: 'north',
    roof: 'gable',
    wall: '#e8d9a8',
    trim: '#4a4f3a',
    accent: '#d9822b',
    action: { panel: 'machines' },
  },
};
