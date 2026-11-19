import type { AnimalId, AnimalProductId, BreedId } from '../data/animals';
import type { DiseaseId, MedicineId } from '../data/health';
import type { CropId } from '../data/crops';
import type { ShelterLevel, StructureId } from '../data/structures';
import type { SkillId } from '../data/workers';

export type TileState = 'locked' | 'grass' | 'tilled' | 'planted' | 'watered';

export interface TileCrop {
  cropId: CropId;
  /** Accumulated watered game minutes of growth (capped at maturity). */
  growthMinutes: number;
}

export interface Tile {
  state: TileState;
  /** Present when state is 'planted' or 'watered'. */
  crop?: TileCrop;
  /** Absolute game minute when the watering wears off (only when 'watered'). */
  wateredUntil?: number;
  /** Structure covering this tile, if any. */
  structure?: StructureId;
  /** Dirt road on this tile (state stays 'grass', or 'locked' for the access road off the farm). */
  road?: true;
  /** Fertilized worked soil: the crop grows faster and may give more (cleared at harvest). */
  fertilized?: true;
}

/** Quarter turns applied to a placed structure. */
export type Rotation = 0 | 1 | 2 | 3;

/** Work the crew still has to do on a structure: raising it, tearing it down or upgrading it. */
export type StructureWorkKind = 'build' | 'demolish' | 'upgrade';

export interface StructureWork {
  kind: StructureWorkKind;
  /** Work minutes done so far (at work speed 1). */
  done: number;
  /** Work minutes needed. */
  total: number;
  /** Level reached when an upgrade is finished. */
  toLevel?: ShelterLevel;
}

/** A structure placed on the grid (the tiles it covers also carry `Tile.structure`). */
export interface StructureInstance {
  id: number;
  type: StructureId;
  /** Top-left tile of the (rotated) footprint. */
  x: number;
  y: number;
  rotation: Rotation;
  /**
   * Construction site, demolition or upgrade in progress. Absent: the structure is finished. The
   * footprint is reserved (Tile.structure) for the whole time; a shelter keeps working while upgraded.
   */
  work?: StructureWork;
  /** Shelter level (absent: 1). */
  level?: ShelterLevel;
  /** Animal products waiting in a shelter for the crew to collect. */
  stock?: ProductCounts;
  /** Manure piled up in a shelter (fractional; whole units are collected as fertilizer). */
  manure?: number;
}

export type ItemCounts = Partial<Record<CropId, number>>;
export type ProductCounts = Partial<Record<AnimalProductId, number>>;
export type MedicineCounts = Partial<Record<MedicineId, number>>;

export interface Inventory {
  seeds: ItemCounts;
  produce: ItemCounts;
  /** Animal products (eggs, milk, wool…). */
  products: ProductCounts;
  /** Medicine bought for sick animals. */
  medicine: MedicineCounts;
  /** Fertilizer (cured manure) units. */
  fertilizer: number;
}

/** What a 'build' or 'tend' task works on. */
export type TaskJob =
  /** A structure site or demolition; the task tile is one of the footprint tiles. */
  | { type: 'structure'; structureId: number }
  /** Opening (or removing) the road on the task tile. */
  | { type: 'road'; remove: boolean }
  /** Collecting a shelter's products ('tend'); the task tile is the footprint tile by the door. */
  | { type: 'shelter'; structureId: number }
  /** Medicating a sick animal ('tend'); the task tile is where the animal was when it was queued. */
  | { type: 'medicate'; animalId: number }
  /** Taking a carcass away ('tend'); the task tile is under the carcass. */
  | { type: 'carcass'; carcassId: number };

/** A queued order on a tile, executed by a worker. */
export interface Task {
  id: number;
  kind: TaskKind;
  tile: number;
  /** Crop to plant (only for 'seed' tasks). */
  cropId: CropId | null;
  /** Worker currently assigned, if any. */
  workerId: number | null;
  /** Present on (and only on) 'build' and 'tend' tasks. */
  job?: TaskJob;
}

/** Staff live in the bunkhouse and earn an hourly wage; day laborers ('temp') leave at the end of the shift. */
export type WorkerKind = 'staff' | 'temp';

/** A point in tile space: tile (x, y) spans [x, x + 1); its center is (x + 0.5, y + 0.5). */
export interface GridPoint {
  x: number;
  y: number;
}

export type Stars = 1 | 2 | 3;

/** What a worker knows best: one crop or one animal. */
export type Specialty = { kind: 'crop'; id: CropId } | { kind: 'animal'; id: AnimalId };

/** Who a person is: shared by workers and hiring candidates. */
export interface WorkerProfile {
  name: string;
  age: number;
  stars: Stars;
  /** General skills, without repeats. */
  skills: SkillId[];
  specialty: Specialty | null;
  /** Coins per hour of shift (staff); day laborers pay up front instead. */
  hourlyWage: number;
}

export interface Worker extends WorkerProfile {
  id: number;
  kind: WorkerKind;
  /** Tasks this worker does, most important first. Tasks of other kinds are left to others. */
  priorities: TaskKind[];
  /** Current position in tile space. */
  x: number;
  y: number;
  taskId: number | null;
  /** Remaining waypoints to the current destination (tile space). */
  path: GridPoint[];
  /** Work minutes already spent on the current task. */
  progress: number;
}

/** Someone on the hiring board. */
export interface Candidate extends WorkerProfile {
  /** Becomes the worker's id when hired. */
  id: number;
  hireCost: number;
}

export type WorkerActivity = 'idle' | 'walking' | 'working' | 'resting';

export interface Animal {
  id: number;
  kind: AnimalId;
  breed: BreedId;
  stars: Stars;
  /** Game minute it was born (before the purchase for adults); the life stage is derived from it. */
  bornAt: number;
  /** The shelter it lives in (it grazes around it and sleeps inside). */
  shelterId: number;
  /** Position in tile space. */
  x: number;
  y: number;
  /** Waypoints it is walking along (a wander leg, or the way home); empty when standing. */
  path: GridPoint[];
  /** Game minutes left resting before picking a new spot. */
  waitMinutes: number;
  /** Fed minutes accumulated toward the next product (it goes to the shelter). */
  productMinutes: number;
  /** Fed today (feed is paid at midnight). */
  fed: boolean;
  /** Absent while healthy. */
  health?: AnimalHealth;
}

/** A sickness (or wound). Its stage (incubating, with symptoms) is derived from `since`. */
export interface AnimalHealth {
  disease: DiseaseId;
  /** Game minute it caught it. */
  since: number;
  /** The farm knows (the card, the tint and medicating follow from this). */
  noticed: boolean;
}

/** What a predator (or a disease) left on the ground, until the crew takes it away. */
export interface Carcass {
  id: number;
  kind: AnimalId;
  breed: BreedId;
  x: number;
  y: number;
  diedAt: number;
  /** The shelter it lived in (its animals risk infection while the carcass lies there). */
  shelterId: number;
}

export type AnimalActivity = 'walking' | 'grazing' | 'sleeping';

export interface GameState {
  /** Absolute game clock in minutes since the start of day 1 at 00:00. */
  gameMinutes: number;
  money: number;
  /** Flat array, index = y * GRID_SIZE + x. */
  tiles: Tile[];
  /** Indices (plotY * PLOTS_PER_SIDE + plotX) of unlocked plots. */
  unlockedPlots: number[];
  /** Number of plots bought (excludes the starting ones). Drives the price curve. */
  plotsPurchased: number;
  inventory: Inventory;
  workers: Worker[];
  /** Hiring board, renewed every midnight. */
  candidates: Candidate[];
  /** Work queue, oldest first. Tasks on the same tile run in queue order. */
  tasks: Task[];
  animals: Animal[];
  carcasses: Carcass[];
  /** Placed structures, including the starting house and shipping bin. */
  structures: StructureInstance[];
  /** Next id for tasks, workers, candidates, animals, carcasses and structures. */
  nextId: number;
}

export type ToolId = 'hoe' | 'seed' | 'water' | 'hand' | 'fertilize';
/** Kinds of queued work: the four farm tools, animal care (collecting at shelters) and construction. */
export type TaskKind = ToolId | 'tend' | 'build';

export type ActionError =
  | 'out-of-bounds'
  | 'locked'
  | 'structure'
  | 'not-grass'
  | 'not-tilled'
  | 'no-seeds'
  | 'no-crop'
  | 'already-watered'
  | 'already-mature'
  | 'not-mature'
  | 'not-enough-money'
  | 'plot-unlocked'
  | 'plot-not-adjacent'
  | 'no-produce'
  | 'invalid-quantity'
  | 'queue-full'
  | 'max-workers'
  | 'no-worker'
  | 'no-candidate'
  | 'no-bed'
  | 'max-temps'
  | 'not-work-time'
  | 'beds-in-use'
  | 'max-animals'
  | 'no-animal'
  | 'no-product'
  | 'not-buildable'
  | 'tile-busy'
  | 'no-structure'
  | 'not-demolishable'
  | 'road'
  | 'already-road'
  | 'no-road'
  | 'under-construction'
  | 'no-shelter'
  | 'shelter-full'
  | 'pasture-full'
  | 'shelter-in-use'
  | 'max-level'
  | 'no-medicine'
  | 'no-fertilizer'
  | 'already-fertilized'
  | 'not-fertilizable'
  | 'not-sick';

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: ActionError };

export const ok = (state: GameState): ActionResult => ({ ok: true, state });
export const fail = (error: ActionError): ActionResult => ({ ok: false, error });
