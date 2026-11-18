import type { AnimalId, AnimalProductId } from '../data/animals';
import type { CropId } from '../data/crops';
import type { StructureId } from '../data/structures';
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
}

/** Quarter turns applied to a placed structure. */
export type Rotation = 0 | 1 | 2 | 3;

/** Work the crew still has to do on a structure: raising it or tearing it down. */
export type StructureWorkKind = 'build' | 'demolish';

export interface StructureWork {
  kind: StructureWorkKind;
  /** Work minutes done so far (at work speed 1). */
  done: number;
  /** Work minutes needed. */
  total: number;
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
   * Construction site or demolition in progress. Absent: the structure is finished and working.
   * The footprint is reserved (Tile.structure) for the whole time.
   */
  work?: StructureWork;
}

export type ItemCounts = Partial<Record<CropId, number>>;
export type ProductCounts = Partial<Record<AnimalProductId, number>>;

export interface Inventory {
  seeds: ItemCounts;
  produce: ItemCounts;
  /** Animal products (eggs, milk, wool…). */
  products: ProductCounts;
}

/** What a construction ('build') task works on. */
export type BuildJob =
  /** A structure site or demolition; the task tile is one of the footprint tiles. */
  | { type: 'structure'; structureId: number }
  /** Opening (or removing) the road on the task tile. */
  | { type: 'road'; remove: boolean };

/** A queued order on a tile, executed by a worker. */
export interface Task {
  id: number;
  kind: TaskKind;
  tile: number;
  /** Crop to plant (only for 'seed' tasks). */
  cropId: CropId | null;
  /** Worker currently assigned, if any. */
  workerId: number | null;
  /** Present on (and only on) 'build' tasks. */
  job?: BuildJob;
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
  /** Position in tile space. */
  x: number;
  y: number;
  /** Where it is wandering to, if moving. */
  target: GridPoint | null;
  /** Game minutes left resting before picking a new spot. */
  waitMinutes: number;
  /** Fed minutes accumulated toward the next product. */
  productMinutes: number;
  /** A product is ready to collect (click the animal). */
  hasProduct: boolean;
  /** Fed today (feed is paid at midnight). */
  fed: boolean;
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
  /** Placed structures, including the starting house and shipping bin. */
  structures: StructureInstance[];
  /** Next id for tasks, workers, candidates, animals and structures. */
  nextId: number;
}

export type ToolId = 'hoe' | 'seed' | 'water' | 'hand';
/** Kinds of queued work: the four farm tools plus construction (structures and roads). */
export type TaskKind = ToolId | 'build';

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
  | 'under-construction';

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: ActionError };

export const ok = (state: GameState): ActionResult => ({ ok: true, state });
export const fail = (error: ActionError): ActionResult => ({ ok: false, error });
