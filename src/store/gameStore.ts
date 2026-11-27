import { fencePlan, orderFenceLine, orderGate, toggleGate } from '../game/fences';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  ANIMALS,
  ANIMAL_PRODUCTS,
  ANIMAL_PRODUCT_IDS,
  BREEDS,
  type AnimalId,
} from '../data/animals';
import { CROPS, CROP_IDS, type CropId } from '../data/crops';
import { SHED_LEVELS, SHELTER_LEVELS, STRUCTURES, type StructureId } from '../data/structures';
import { SEASONS, SEASON_DAYS } from '../data/climate';
import { DISEASES, MEDICINES, PREDATORS, type MedicineId, type PredatorId } from '../data/health';
import { GAME_MINUTES_PER_REAL_SECOND, type GameSpeed } from '../data/world';
import { callBuyer, markForSale, unmarkForSale } from '../game/pen';
import { buyPlot } from '../game/economy';
import { plotOfTile, tileCoords, tileIndex, tilesInRect } from '../game/grid';
import {
  DEFAULT_SETTINGS,
  SAVE_KEY,
  clearStorage,
  isOutdatedSave,
  loadFromStorage,
  writeToStorage,
  type GraphicsQuality,
  type SaveSettings,
} from '../game/save';
import { demolishClick, orderRoad, orderStructure, orderUpgrade, roadClick, type DemolishChange } from '../game/construction';
import { medicateTaskFor, medicineFor, type PredatorAttack } from '../game/health';
import { emptyCart, giveUpHeld, giveUpRefund, orderPurchase, reorderHeld, setFeedOrder, type Cart } from '../game/purchases';
import { DOCK_LEVELS, LIVESTOCK } from '../data/docks';
import { MACHINES, type MachineId, type RentalDays } from '../data/machines';
import { buyMachine, callMechanic, rentMachine, returnRental, sellMachine, type MachineEvent } from '../game/machines';
import { canJoyride } from '../game/joyride';
import type { Delivery } from '../game/types';
import { setFreightVehicle, upgradeVehicle, type Good } from '../game/market';
import type { VehicleLevel } from '../data/market';
import { acceptOffer, declineOffer, postListing, removeListing, repriceListing, sendOrder } from '../game/listings';
import { startResearch } from '../game/research';
import { CAMERA } from '../data/camera';
import { CITY_SHOPS, type CityShopId } from '../data/city';
import { TOWN_SHOPS, VEHICLES } from '../data/market';
import { seasonOf, weatherLook } from '../game/climate';
import { advanceGame, type FinishedWork } from '../game/simulation';
import type { Spoiled } from '../game/storage';
import { createInitialState, newSoilSeed } from '../game/state';
import { canSurvey, hasAgronomist, orderSurvey, surveyedTypes } from '../game/survey';
import { addField, fieldAt, removeField as removeFieldAction, renameField as renameFieldAction } from '../game/fields';
import { SOILS, SOIL_SURVEY } from '../data/soil';
import { cancelLoading, dismissShipment, startLoading, type DockEvent } from '../game/shipments';
import { bayPoint, docksOf } from '../game/dock';
import { anchorFor, structureAt } from '../game/structures';
import { dismissWorker, hireCandidate, hireTemp, setPriorities } from '../game/staff';
import type { ActionError, ActionResult, Animal, GameState, Rotation, TaskKind, ToolId } from '../game/types';
import { applyArea, areaMode, clearTasks, toggleTask } from '../game/workers';

export type PanelId = 'shop' | 'inventory' | 'workers' | 'build' | 'market' | 'garage' | 'machines' | 'dock' | null;

/** Dock panel tabs: the bay, selling by listing, the town's orders. */
export type DockTab = 'bay' | 'sell' | 'orders';

/** Shop panel tabs. */
export type ShopTab = 'seeds' | 'animals' | 'medicine' | 'land';

/** Which world the scene shows. */
export type View = 'farm' | 'city';

/** Build mode: placing a structure type, painting roads, dragging fences, placing gates, or demolishing. */
export type BuildMode = StructureId | 'road' | 'fence' | 'gate' | 'demolish' | null;

/** Build modes that are not a structure (no footprint, no rotation). */
export const LINE_MODES: ReadonlyArray<BuildMode> = ['road', 'fence', 'gate', 'demolish'];

/** True when the build mode places a structure. */
export const isStructureMode = (mode: BuildMode): mode is StructureId => mode !== null && !LINE_MODES.includes(mode);

/** Fence line being dragged: from the tile where the press started to the one under the cursor. */
export interface FenceDrag {
  from: number;
  to: number;
}

/** Area being dragged with a tool: from the tile where the press started to the one under the cursor. */
export interface AreaDrag {
  anchor: number;
  current: number;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'error' | 'info';
}

/** A predator seen running off after an attack (scene only, never saved). */
export interface PredatorSighting {
  id: number;
  predator: PredatorId;
  x: number;
  y: number;
  /** performance.now() / 1000 when it was seen. */
  at: number;
}

export type SoilLayer = 'type' | 'crop' | 'pasture';
export type SoilTool = 'survey' | 'field' | null;

/** What opening the soil view (or another mode that replaces it) clears. */
const SOIL_VIEW_OFF = { infoView: null, soilTool: null, fieldDrag: null, selectedField: null } as const;

export interface GameStore {
  game: GameState;
  settings: SaveSettings;
  /** Active order tool, or null for the hand: left drag moves the camera and clicks select. */
  tool: ToolId | null;
  /** Structure selected with the hand (its card is open). */
  selectedStructure: number | null;
  /** The activities hub (order tools and seeds) is open above the dock. */
  activitiesOpen: boolean;
  selectedCrop: CropId;
  hoveredTile: number | null;
  /** Animal under the mouse (takes priority over the tile in the hover card). */
  hoveredAnimal: number | null;
  panel: PanelId;
  /** Plot the player clicked on and may confirm buying. */
  pendingPlot: number | null;
  toast: Toast | null;
  lastSavedAt: number | null;
  /** Dev-only extra time multiplier (not saved). */
  devTimeScale: number;
  buildMode: BuildMode;
  buildRotation: Rotation;
  area: AreaDrag | null;
  fenceDrag: FenceDrag | null;
  /** Worker whose card is open in the team hub. */
  selectedWorker: number | null;
  /** Soil view (a map of the soil over the farm), its layer, crop and tool. Not saved. */
  infoView: 'soil' | null;
  soilLayer: SoilLayer;
  soilCrop: CropId;
  soilTool: SoilTool;
  fieldDrag: AreaDrag | null;
  selectedField: number | null;
  /** Opens the soil view, or closes it when it is open. */
  toggleSoilView: () => void;
  closeSoilView: () => void;
  setSoilLayer: (layer: SoilLayer) => void;
  setSoilCrop: (crop: CropId) => void;
  /** Picks a soil view tool (the active one again: none). */
  setSoilTool: (tool: SoilTool) => void;
  /** Survey tool on a tile: 'toggle' orders or cancels the plot's survey (click), 'order' only orders (drag). */
  surveyAt: (tile: number, mode: 'toggle' | 'order') => void;
  /** New field tool: press, drag, release. */
  beginField: (tile: number) => void;
  extendField: (tile: number) => void;
  finishField: () => void;
  cancelField: () => void;
  selectField: (id: number | null) => void;
  renameField: (id: number, name: string) => void;
  removeField: (id: number) => void;

  advance: (realSeconds: number) => void;
  interactAt: (tile: number) => void;
  /** Area orders: press on a tile, drag, release (a plain click is a 1×1 area). */
  beginArea: (tile: number) => void;
  extendArea: (tile: number) => void;
  finishArea: () => void;
  cancelArea: () => void;
  /** Road painting while dragging: queues road work silently (errors are not shown on every tile). */
  paintRoadAt: (tile: number) => void;
  /** Fence mode: press on a tile, drag (snapped to 45°), release to queue the line. */
  beginFence: (tile: number) => void;
  extendFence: (tile: number) => void;
  finishFence: () => void;
  cancelFence: () => void;
  /** Picks an order tool; null (or the active one again) goes back to the hand. */
  setTool: (tool: ToolId | null) => void;
  selectStructure: (id: number | null) => void;
  /** Opens or closes the activities hub (toggles without an argument). */
  setActivitiesOpen: (open?: boolean) => void;
  /** Queues upgrading a shelter to its next level. */
  upgradeShelter: (id: number) => void;
  /** Demolish tool on a structure from its card: queues the tear-down, or cancels the work under way. */
  demolishOrCancel: (id: number) => void;
  setBuildMode: (mode: BuildMode) => void;
  rotateBuild: () => void;
  setSelectedCrop: (crop: CropId) => void;
  setHoveredTile: (tile: number | null) => void;
  setHoveredAnimal: (animal: number | null) => void;
  setSpeed: (speed: GameSpeed) => void;
  togglePause: () => void;
  setEdgePan: (enabled: boolean) => void;
  setGraphics: (graphics: GraphicsQuality) => void;
  /** Toggles a panel. */
  openPanel: (panel: PanelId) => void;
  showPanel: (panel: PanelId) => void;
  closePanel: () => void;
  requestPlot: (plot: number | null) => void;
  confirmPlot: () => void;
  /** What the player picked in the shop (not saved). */
  cart: Cart;
  updateCart: (change: (cart: Cart) => Cart) => void;
  clearCart: () => void;
  /** Orders the cart by freight. */
  orderCart: () => void;
  /** Orders something right away by freight, leaving the cart alone (e.g. medicine from an animal's card). */
  orderNow: (cart: Cart) => void;
  /** Pays a new freight for a delivery held in town. */
  reorderHeld: (heldId: number) => void;
  giveUpHeld: (heldId: number) => void;
  setFeedOrder: (auto: boolean, days: number) => void;
  /** Orders the crew to load the vehicle parked at the dock (the goods leave the inventory now). */
  startLoading: (shipmentId: number) => void;
  /** Calls the loading off: the goods come back and the vehicle keeps waiting. */
  cancelLoading: (shipmentId: number) => void;
  /** Sends a vehicle away without its load, or calls a sale off. */
  dismissShipment: (shipmentId: number) => void;
  /** Opens the dock panel (on a tab) and brings the camera to the dock. */
  openDock: (tab?: DockTab) => void;
  dockTab: DockTab;
  setDockTab: (tab: DockTab) => void;
  postListing: (good: Good, price: number, quantity: number) => void;
  repriceListing: (listingId: number, price: number) => void;
  removeListing: (listingId: number) => void;
  /** Closes an offer: pays the freight and sets the goods aside. */
  acceptOffer: (offerId: number) => void;
  declineOffer: (offerId: number) => void;
  /** Sends a town order by freight. */
  sendOrder: (orderId: number) => void;
  hireCandidate: (candidateId: number) => void;
  hireTemp: () => void;
  dismiss: (workerId: number) => void;
  setPriorities: (workerId: number, priorities: TaskKind[]) => void;
  /** Opens the team hub on a worker's card (null closes the card). */
  selectWorker: (workerId: number | null) => void;
  clearTasks: () => void;
  /** Marks an animal for sale: the crew leads it to the loading pen. */
  markForSale: (animalId: number) => void;
  /** Takes an animal off sale (it goes back to its shelter). */
  unmarkForSale: (animalId: number) => void;
  /** Calls a buyer's livestock truck to a loading pen. */
  callBuyer: (penId: number) => void;
  /** Animal selected with the hand (its card is open). */
  selectedAnimal: number | null;
  selectAnimal: (id: number | null) => void;
  /** Recent predator attacks, for the figure running away. */
  sightings: PredatorSighting[];
  /** Shows the toast and the fleeing predator for attacks (also used by the dev tools). */
  reportAttacks: (attacks: readonly PredatorAttack[]) => void;
  /** Shows a predator running off from a spot (tile space), without any attack. */
  showSighting: (predator: PredatorId, x: number, y: number) => void;
  /** Farm or town. Not saved: the game always opens on the farm. */
  view: View;
  goToCity: () => void;
  /** Machine the player is driving with WASD, just for fun (not saved). */
  joyride: number | null;
  startJoyride: (machineId: number) => void;
  stopJoyride: (message?: string) => void;
  goToFarm: () => void;
  /** Opens what a town shop offers. */
  openCityShop: (id: CityShopId) => void;
  /** Tab the shop panel opens on. */
  shopTab: ShopTab;
  setShopTab: (tab: ShopTab) => void;
  upgradeVehicle: () => void;
  /** Dealership tab: freight contracts or machines. */
  buyMachine: (type: MachineId) => void;
  sellMachine: (machineId: number) => void;
  rentMachine: (type: MachineId, days: RentalDays, withOperator: boolean) => void;
  returnRental: (machineId: number) => void;
  callMechanic: (machineId: number) => void;
  /** Which vehicle the freight comes with ('auto': the smallest that fits each load). */
  setFreightVehicle: (choice: 'auto' | VehicleLevel) => void;
  startResearch: (cropId: CropId) => void;
  /** Last request to move the camera to a spot (tile space); the camera rig follows new ids. */
  cameraFocus: { id: number; x: number; y: number; distance?: number } | null;
  /** Centers the camera on a spot; `distance` sets the zoom (default: come close). */
  focusCamera: (x: number, y: number, distance?: number) => void;
  /** Dev tools: applies a state transform directly. */
  devApply: (transform: (game: GameState) => GameState, message?: string) => void;
  setDevTimeScale: (scale: number) => void;
  save: () => void;
  newGame: () => void;
  showMessage: (text: string, kind?: Toast['kind']) => void;
}

/** pt-BR messages for game action errors. */
export const ERROR_MESSAGES: Record<ActionError, string> = {
  'out-of-bounds': 'Fora do mapa.',
  locked: 'Terreno bloqueado. Compre este lote primeiro.',
  structure: 'Há uma construção aqui.',
  'not-grass': 'Só é possível arar grama.',
  'not-tilled': 'Are a terra antes de plantar.',
  'no-seeds': 'Você não tem sementes desta cultura.',
  'no-crop': 'Não há planta aqui.',
  'already-watered': 'Esta planta já foi regada hoje.',
  'already-mature': 'A planta já está pronta para colher.',
  'not-mature': 'A planta ainda não está madura.',
  'not-enough-money': 'Dinheiro insuficiente.',
  'plot-unlocked': 'Este lote já é seu.',
  'plot-not-adjacent': 'Só é possível comprar lotes vizinhos à fazenda.',
  'no-produce': 'Nada para vender.',
  'invalid-quantity': 'Quantidade inválida.',
  'queue-full': 'A fila de tarefas está cheia.',
  'max-workers': 'A fazenda já tem o máximo de trabalhadores.',
  'no-worker': 'Trabalhador não encontrado.',
  'no-candidate': 'Este candidato não está mais disponível.',
  'no-bed': 'Sem cama livre no alojamento. Construa outro alojamento.',
  'max-temps': 'Já há esporádicos demais hoje.',
  'not-work-time': 'Esporádicos só são contratados durante o expediente.',
  'beds-in-use': 'Há trabalhadores dormindo neste alojamento.',
  'max-animals': 'A fazenda já tem o máximo de animais.',
  'no-animal': 'Você não tem esse animal.',
  'no-product': 'Este animal ainda não tem nada para coletar.',
  'not-buildable': 'Esta construção não pode ser feita.',
  'tile-busy': 'Há tarefas na fila neste lugar.',
  'no-structure': 'Não há construção aqui.',
  'not-demolishable': 'Esta construção não pode ser demolida.',
  road: 'Há uma estrada aqui.',
  'no-room-for-road': 'Falta espaço para a rua em volta: deixe 1 tile de grama livre (ou estrada) ao redor, na sua terra.',
  'shelter-no-road': 'Nenhum abrigo desta espécie tem acesso por estrada. Ligue a rua dele à estrada de acesso.',
  'already-road': 'Já existe estrada aqui.',
  'no-road': 'Não há nada para demolir aqui.',
  'under-construction': 'Esta construção já está em obra.',
  'no-shelter': 'Construa um abrigo para esta espécie primeiro (menu Construir).',
  'shelter-full': 'Os abrigos desta espécie estão cheios. Construa outro.',
  'pasture-full': 'O pasto está lotado. Compre um lote ou deixe mais grama livre.',
  'shelter-in-use': 'Há animais morando neste abrigo. Venda-os antes de demolir.',
  'max-level': 'Este abrigo já está no nível mais alto disponível.',
  'no-medicine': 'Sem remédio para este animal. Compre na loja.',
  'no-fertilizer': 'Sem adubo. Recolha esterco nos abrigos ou compre na loja.',
  'already-fertilized': 'Esta terra já está adubada.',
  'not-fertilizable': 'Só é possível adubar terra arada ou plantada.',
  'vehicle-full': 'O veículo está cheio. Troque por um maior na concessionária.',
  'needs-greenhouse': 'Esta cultura só cresce dentro de uma estufa.',
  'not-researched': 'Pesquise esta cultura antes de comprar as sementes.',
  researching: 'Já há uma pesquisa em andamento.',
  'already-researched': 'Esta cultura já é conhecida.',
  'already-surveyed': 'Esse lote já foi analisado.',
  'cannot-survey': 'Só dá para analisar lotes da fazenda ou vizinhos à venda.',
  'field-overlap': 'Esse talhão encosta em outro.',
  'field-not-owned': 'O talhão precisa ficar na terra da fazenda.',
  'field-name-empty': 'Dê um nome ao talhão.',
  'no-field': 'Esse talhão não existe mais.',
  'no-water-needed': 'Não precisa regar: árvores do pomar e plantas na estufa se viram sozinhas.',
  'not-sick': 'Este animal não está doente.',
  'no-shipment': 'Este veículo não está mais esperando na doca.',
  'not-enough-goods': 'Falta mercadoria no estoque para este pedido.',
  'no-listing': 'Este anúncio não existe mais.',
  'no-offer': 'Esta oferta não está mais de pé.',
  'too-many-listings': 'Já há anúncios demais. Tire um antes de pôr outro.',
  'invalid-price': 'Preço inválido.',
  'no-order': 'Este pedido não está mais aberto.',
  'dock-no-road': 'A doca está sem acesso por estrada: o frete não chega.',
  'no-pen': 'Construa um curral de embarque (menu Construir, Animais) ligado à estrada para vender animais.',
  'pen-full': 'O curral de embarque está cheio. Chame o comprador ou construa outro curral.',
  'not-penned': 'Não há animal esperando no curral.',
  'on-truck': 'Este animal já está na lista do caminhão boiadeiro.',
  'no-truck-bay': 'O caminhão precisa de uma vaga de caminhão: melhore a doca (nível 3).',
  'too-many-heads': `O caminhão boiadeiro leva até ${LIVESTOCK.maxHeads} animais por viagem.`,
  'empty-cart': 'O carrinho está vazio.',
  'no-held': 'Esta entrega não está mais retida na cidade.',
  reserved: 'Está em uso: há animais a caminho com vaga reservada ou máquinas guardadas aqui.',
  fence: 'Tem uma cerca aqui.',
  'no-fence': 'Não há cerca aqui.',
  'already-fence': 'Já tem cerca aqui.',
  'not-gate': 'Isso não é uma porteira.',
  'no-room-for-fence': 'Nenhum tile livre para cerca nessa linha.',
  'no-shed': 'Construa um galpão de máquinas com estrada e vaga livre.',
  'no-parking': 'Precisa de um estacionamento ou galpão com estrada e vaga livre.',
  'no-machine': 'Máquina não encontrada.',
  'machine-busy': 'A máquina está em uso. Espere ela voltar para a vaga.',
  'machine-broken': 'A máquina está quebrada.',
};

const label = (type: StructureId): string => STRUCTURES[type].label;

/** Toast text for what the demolish tool did. */
const demolishText = (change: DemolishChange): string => {
  switch (change.kind) {
    case 'build-cancelled':
      return `Obra de ${label(change.type).toLowerCase()} cancelada: +${change.refund} moedas.`;
    case 'upgrade-cancelled':
      return `Reforma de ${label(change.type).toLowerCase()} cancelada: +${change.refund} moedas.`;
    case 'demolish-queued':
      return `Demolição de ${label(change.type).toLowerCase()} na fila: devolve ${change.refund} moedas ao terminar.`;
    case 'demolish-cancelled':
      return `Demolição de ${label(change.type).toLowerCase()} cancelada.`;
    case 'road-cancelled':
      return change.refund > 0 ? `Estrada cancelada: +${change.refund} moedas.` : 'Remoção de estrada cancelada.';
    case 'road-removal-queued':
      return 'Remoção da estrada na fila.';
    case 'fence-cancelled':
      return change.refund > 0 ? `Cerca cancelada: +${change.refund} moedas.` : 'Remoção de cerca cancelada.';
    case 'fence-removal-queued':
      return 'Remoção da cerca na fila: devolve parte do preço ao terminar.';
  }
};

/** "vaca Gir" */
const animalName = (a: Pick<Animal, 'kind' | 'breed'>): string => `${ANIMALS[a.kind].label.toLowerCase()} ${BREEDS[a.breed].label}`;

const shelterName = (game: GameState, shelterId: number): string => {
  const shelter = game.structures.find((x) => x.id === shelterId);
  return shelter ? STRUCTURES[shelter.type].label.toLowerCase() : 'abrigo';
};

const attackText = (game: GameState, attack: PredatorAttack): string => {
  const who = PREDATORS[attack.predator].label;
  const where = shelterName(game, attack.victim.shelterId);
  return attack.outcome === 'eaten'
    ? `${who} atacou o ${where} e matou: ${animalName(attack.victim)}. A carcaça ficou no chão.`
    : `${who} atacou o ${where} e feriu: ${animalName(attack.victim)}. Trate com antibiótico.`;
};

/** Toast text for a sickness the farm just noticed. */
const sickText = (game: GameState, animal: Animal): string => {
  if (!animal.health) return '';
  const disease = DISEASES[animal.health.disease];
  const medicine = medicineFor(animal);
  const care = medicateTaskFor(game.tasks, animal.id)
    ? 'A equipe vai medicar.'
    : `Compre ${medicine ? MEDICINES[medicine].label.toLowerCase() : 'remédio'} na loja.`;
  return `${disease.icon} ${disease.label}: ${animalName(animal)} está doente. ${care}`;
};

/** Toast text for what spoiled overnight, e.g. "2 🍅 tomate, 1 🥛 leite". */
const spoiledText = (spoiled: Spoiled): string => {
  const parts: string[] = [];
  for (const id of CROP_IDS) {
    const n = spoiled.produce[id];
    if (n) parts.push(`${n} ${CROPS[id].icon} ${CROPS[id].label.toLowerCase()}`);
  }
  for (const id of ANIMAL_PRODUCT_IDS) {
    const n = spoiled.products[id];
    if (n) parts.push(`${n} ${ANIMAL_PRODUCTS[id].icon} ${ANIMAL_PRODUCTS[id].label.toLowerCase()}`);
  }
  return parts.join(', ');
};

/** "6 🌾 trigo" */
const lotText = (lines: readonly { good: Good; quantity: number }[]): string =>
  lines
    .map(({ good, quantity }) => {
      const def = good.kind === 'crop' ? CROPS[good.id] : ANIMAL_PRODUCTS[good.id];
      return `${quantity} ${def.icon} ${def.label.toLowerCase()}`;
    })
    .join(', ');

/** "20 kg de ração, 2 galinhas" */
export const deliveryText = (d: Delivery): string => {
  const parts: string[] = [];
  for (const id of CROP_IDS) if (d.seeds[id]) parts.push(`${d.seeds[id]} ${CROPS[id].icon} semente(s) de ${CROPS[id].label.toLowerCase()}`);
  if (d.fertilizer) parts.push(`${d.fertilizer} de adubo`);
  for (const [id, n] of Object.entries(d.medicine)) if (n) parts.push(`${n} ${MEDICINES[id as MedicineId].label.toLowerCase()}`);
  if (d.feed) parts.push(`${d.feed} kg de ração`);
  const heads = new Map<AnimalId, number>();
  for (const a of d.animals) heads.set(a.kind, (heads.get(a.kind) ?? 0) + 1);
  for (const [kind, n] of heads) parts.push(`${n} ${ANIMALS[kind].icon} ${ANIMALS[kind].label.toLowerCase()}`);
  return parts.join(', ');
};

/** Toast for a vehicle that parked, was loaded or left without its load. */
const dockText = (event: DockEvent): { text: string; kind: Toast['kind'] } => {
  const s = event.shipment;
  if (s.kind === 'livestock') {
    const heads = s.animals?.length ?? 0;
    if (event.kind === 'arrived') return { text: `🚛 O boiadeiro chegou ao curral: a equipe está embarcando ${heads} animal(is).`, kind: 'info' };
    if (event.kind === 'sold') return { text: `🚛 Boiadeiro carregado: ${heads} animal(is) vendido(s), +${s.payment} moedas.`, kind: 'info' };
    return { text: '🚛 O boiadeiro não foi carregado a tempo e foi embora; os animais continuam no curral.', kind: 'error' };
  }
  if (s.kind === 'purchase') {
    const what = s.delivery ? deliveryText(s.delivery) : 'a compra';
    if (event.kind === 'arrived') {
      return {
        text:
          s.phase === 'loading'
            ? `📦 A entrega chegou à doca: a equipe está descarregando ${what}.`
            : `📦 A entrega chegou à doca, mas a fila está cheia: mande descarregar.`,
        kind: 'info',
      };
    }
    if (event.kind === 'delivered') return { text: `📦 Entrega descarregada: ${what}.`, kind: 'info' };
    return {
      text: `📦 Ninguém descarregou a entrega a tempo e ela voltou para a cidade (${what}). Peça um novo frete na doca.`,
      kind: 'error',
    };
  }
  if (s.kind === 'sale') {
    const buyer = s.order ? `${TOWN_SHOPS[s.order.shop].icon} ${TOWN_SHOPS[s.order.shop].label}` : 'comprador';
    if (event.kind === 'arrived') {
      return {
        text:
          s.phase === 'loading'
            ? `🚚 O frete chegou à doca: a equipe já está carregando ${lotText(s.goods)}.`
            : `🚚 O frete chegou à doca, mas a fila está cheia: mande carregar.`,
        kind: 'info',
      };
    }
    if (event.kind === 'sold') {
      return { text: `🚚 Frete carregado: ${lotText(s.goods)} para ${buyer}, +${s.payment} moedas.`, kind: 'info' };
    }
    const lost = s.lost ? `, menos ${s.lost} unidade(s) avariada(s)` : '';
    const back = s.order ? ' O pedido voltou para a lista enquanto estiver no prazo.' : '';
    return {
      text: `🚚 A venda para ${buyer} não saiu a tempo: a mercadoria voltou ao estoque${lost}. O frete pago não volta.${back}`,
      kind: 'error',
    };
  }
  if (event.kind === 'arrived') {
    return {
      text: `🚗 Cliente na doca: quer ${lotText(s.goods)} por ${s.payment} moedas. Abra a doca para mandar carregar.`,
      kind: 'info',
    };
  }
  if (event.kind === 'sold') return { text: `🚗 Venda na doca: ${lotText(s.goods)}, +${s.payment} moedas.`, kind: 'info' };
  const lost = s.lost ? ` A equipe descarregou o que já tinha posto e ${s.lost} unidade(s) se perderam.` : '';
  return { text: `🚗 O cliente cansou de esperar e foi embora sem a carga.${lost}`, kind: 'error' };
};

/** Toast text for a site, upgrade or demolition the crew finished. */
const finishedText = (work: FinishedWork): string => {
  if (work.kind === 'build') {
    return work.cutOff
      ? `${label(work.type)} pronto(a), mas sem acesso por estrada: ligue a rua dele à estrada de acesso.`
      : `${label(work.type)} pronto(a)!`;
  }
  if (work.kind === 'upgrade') {
    return `${label(work.type)} reformado(a): agora é ${work.level ? SHELTER_LEVELS[work.level].label.toLowerCase() : 'melhor'}.`;
  }
  return `${label(work.type)} demolido(a): +${work.refund ?? 0} moedas.`;
};

const storage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

const loaded = (() => {
  const s = storage();
  return s ? loadFromStorage(s) : null;
})();

/** A save from before the bigger map was found: the game starts over (and says why). */
const outdatedSave = (() => {
  if (loaded) return false;
  try {
    return isOutdatedSave(storage()?.getItem(SAVE_KEY) ?? null);
  } catch {
    return false;
  }
})();

/** Why a save text could not be loaded, for the toast. */
export const saveLoadError = (raw: string | null): string =>
  isOutdatedSave(raw)
    ? 'Este save é de uma versão antiga, do mapa menor, e não pode mais ser carregado.'
    : 'Este arquivo não é um save do uValley.';

const MACHINE_EVENT_TEXT: Record<MachineEvent['kind'], (name: string) => string> = {
  arrived: (n) => `🚜 ${n} chegou à vaga.`,
  'rental-ended': (n) => `Aluguel terminou: ${n.toLowerCase()} foi devolvido(a).`,
  broke: (n) => `${n} quebrou e voltou para a vaga. Conserte na oficina ou chame o mecânico.`,
  repaired: (n) => `🔧 ${n} consertado(a).`,
  'no-fuel': (n) => `Sem dinheiro para o diesel: ${n.toLowerCase()} voltou para a vaga.`,
};

const machineText = (event: MachineEvent): string => MACHINE_EVENT_TEXT[event.kind](MACHINES[event.type].label);

let toastCounter = 0;
let sightingCounter = 0;

export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set, get) => {
    /** Applies an ActionResult: commits the state or shows the error. Returns success. */
    const commit = (result: ActionResult, successText?: string): boolean => {
      if (!result.ok) {
        get().showMessage(ERROR_MESSAGES[result.error], 'error');
        return false;
      }
      set({ game: result.state });
      if (successText) get().showMessage(successText, 'info');
      return true;
    };

    return {
      game: loaded?.game ?? createInitialState(newSoilSeed()),
      settings: loaded?.settings ?? DEFAULT_SETTINGS,
      tool: null,
      selectedStructure: null,
      selectedAnimal: null,
      activitiesOpen: false,
      selectedCrop: 'wheat',
      hoveredTile: null,
      hoveredAnimal: null,
      panel: null,
      pendingPlot: null,
      toast: outdatedSave
        ? {
            id: ++toastCounter,
            text: 'O mapa cresceu e as construções agora precisam de estrada: começamos uma fazenda nova.',
            kind: 'info',
          }
        : null,
      lastSavedAt: null,
      devTimeScale: 1,
      buildMode: null,
      buildRotation: 0,
      area: null,
      fenceDrag: null,
      selectedWorker: null,
      infoView: null,
      soilLayer: 'type',
      soilCrop: 'wheat',
      soilTool: null,
      fieldDrag: null,
      selectedField: null,
      toggleSoilView: () => {
        if (get().infoView === 'soil') {
          set(SOIL_VIEW_OFF);
          return;
        }
        set({
          infoView: 'soil',
          tool: null,
          buildMode: null,
          panel: null,
          area: null,
          fenceDrag: null,
          activitiesOpen: false,
          selectedStructure: null,
          selectedAnimal: null,
        });
      },
      closeSoilView: () => set(SOIL_VIEW_OFF),
      setSoilLayer: (soilLayer) => set({ soilLayer }),
      setSoilCrop: (soilCrop) => set({ soilCrop, soilLayer: 'crop' }),
      setSoilTool: (soilTool) => set((s) => ({ soilTool: soilTool === s.soilTool ? null : soilTool, fieldDrag: null })),
      surveyAt: (tile, mode) => {
        const { game } = get();
        const plot = plotOfTile(tile);
        const queued = game.tasks.some((t) => t.job?.type === 'survey' && t.job.plot === plot);
        if (mode === 'order' && (queued || game.surveyedPlots.includes(plot) || !canSurvey(game, plot))) return;
        const result = orderSurvey(game, plot);
        if (!result.ok) {
          if (mode === 'toggle') get().showMessage(ERROR_MESSAGES[result.error], 'error');
          return;
        }
        set({ game: result.state });
        if (queued) get().showMessage(`Análise cancelada: +${SOIL_SURVEY.cost} moedas.`, 'info');
        else if (!hasAgronomist(result.state)) get().showMessage('Análise na fila. Contrate um agrônomo (🔬) para fazer a análise.', 'error');
        else get().showMessage(`🔬 Análise na fila (${SOIL_SURVEY.cost} moedas): o agrônomo vai colher as amostras.`, 'info');
      },
      beginField: (tile) => set({ fieldDrag: { anchor: tile, current: tile } }),
      extendField: (tile) => {
        const { fieldDrag } = get();
        if (fieldDrag && fieldDrag.current !== tile) set({ fieldDrag: { ...fieldDrag, current: tile } });
      },
      finishField: () => {
        const { fieldDrag, game } = get();
        if (!fieldDrag) return;
        set({ fieldDrag: null });
        const result = addField(game, fieldDrag.anchor, fieldDrag.current);
        if (!result.ok) {
          get().showMessage(ERROR_MESSAGES[result.error], 'error');
          return;
        }
        set({ game: result.state, selectedField: game.nextId, soilTool: null });
        get().showMessage('Talhão criado: dê um nome a ele no card.', 'info');
      },
      cancelField: () => set({ fieldDrag: null }),
      selectField: (selectedField) => set({ selectedField }),
      renameField: (id, name) => {
        commit(renameFieldAction(get().game, id, name));
      },
      removeField: (id) => {
        if (commit(removeFieldAction(get().game, id), 'Talhão apagado.')) set({ selectedField: null });
      },

      advance: (realSeconds) => {
        const { settings, game, devTimeScale } = get();
        if (settings.speed === 0 || realSeconds <= 0) return;
        const dt = realSeconds * GAME_MINUTES_PER_REAL_SECOND * settings.speed * devTimeScale;
        const tick = advanceGame(game, dt);
        const { state, workersLeft, hungryAnimals, tempsLeft, worksFinished, animalsDied } = tick;
        set({ game: state });
        for (const animal of tick.sickNoticed) get().showMessage(sickText(state, animal), 'error');
        for (const report of tick.weatherReports) {
          const weather = weatherLook(report.day);
          const season = SEASONS[seasonOf(report.day)];
          const start = (report.day - 1) % SEASON_DAYS === 0 ? ` ${season.icon} Começou: ${season.label.toLowerCase()}.` : '';
          if (report.destroyed > 0) {
            get().showMessage(`${weather.icon} ${weather.label}: destruiu ${report.destroyed} planta(s).${start}`, 'error');
          } else if (report.watered > 0) {
            get().showMessage(`${weather.icon} ${weather.label} hoje: a lavoura foi regada.${start}`, 'info');
          } else if (start) {
            get().showMessage(`${start.trim()} Hoje: ${weather.icon} ${weather.label.toLowerCase()}.`, 'info');
          }
        }
        if (tick.researched) {
          const crop = CROPS[tick.researched];
          get().showMessage(`🔬 Pesquisa concluída: ${crop.icon} ${crop.label} já pode ser plantado(a).`, 'info');
        }
        if (tick.spoiled) get().showMessage(`Estragou no estoque: ${spoiledText(tick.spoiled)}.`, 'error');
        for (const plot of tick.surveyed) {
          const types = surveyedTypes(tick.state, plot).map((id) => SOILS[id].label);
          const list = types.length > 1 ? `${types.slice(0, -1).join(', ')} e ${types.at(-1) ?? ''}` : (types[0] ?? '');
          get().showMessage(`🔬 Análise do lote pronta: ${list}.`, 'info');
        }
        for (const [cropId, count] of Object.entries(tick.withered) as [CropId, number][]) {
          const crop = CROPS[cropId];
          get().showMessage(`🥀 ${count} pé${count === 1 ? '' : 's'} de ${crop.label} murch${count === 1 ? 'ou' : 'aram'}: solo péssimo.`, 'error');
        }
        if (tick.newOffers.length > 0) {
          const offer = tick.newOffers[0];
          const listing = offer && state.listings.find((l) => l.id === offer.listingId);
          get().showMessage(
            tick.newOffers.length === 1 && offer && listing
              ? `📨 Oferta: ${lotText([{ good: listing.good, quantity: offer.quantity }])} a ${offer.price} cada. Veja na doca.`
              : `📨 ${tick.newOffers.length} ofertas novas nos seus anúncios. Veja na doca.`,
            'info',
          );
        }
        for (const event of tick.machineEvents) get().showMessage(machineText(event), event.kind === 'broke' || event.kind === 'no-fuel' ? 'error' : 'info');
        for (const event of tick.dockEvents) {
          const { text, kind } = dockText(event);
          get().showMessage(text, kind);
        }
        if (tick.predatorAttacks.length > 0) get().reportAttacks(tick.predatorAttacks);
        if (tick.diedOfSickness.length > 0) {
          const names = tick.diedOfSickness
            .map((a) => `${animalName(a)} (${a.health ? DISEASES[a.health.disease].label.toLowerCase() : 'doença'})`)
            .join(', ');
          get().showMessage(`Morreu sem tratamento: ${names}. A carcaça ficou no chão.`, 'error');
          if (tick.diedOfSickness.some((a) => a.id === get().selectedAnimal)) set({ selectedAnimal: null });
        }
        for (const work of worksFinished) get().showMessage(finishedText(work), 'info');
        if (animalsDied.length > 0) {
          const names = animalsDied.map(animalName).join(', ');
          get().showMessage(`Morreu de velhice: ${names}.`, 'info');
          if (animalsDied.some((a) => a.id === get().selectedAnimal)) set({ selectedAnimal: null });
        }
        if (tempsLeft > 0) get().showMessage('Fim do expediente: os esporádicos foram embora.', 'info');
        if (hungryAnimals > 0) {
          get().showMessage(`Faltou ração: ${hungryAnimals} animal(is) com fome hoje. Peça ração na loja.`, 'error');
        }
        if (tick.feedOrdered > 0) get().showMessage(`🥣 Ração pedida automaticamente: ${tick.feedOrdered} kg.`, 'info');
        if (workersLeft.length > 0) {
          get().showMessage(`${workersLeft.join(', ')} foi embora: faltou dinheiro para o salário.`, 'error');
        }
      },

      interactAt: (tile) => {
        const { game } = get();
        const target = game.tiles[tile];
        if (!target) return;
        // In the soil view a click picks a field; the view's tools answer to pointer presses instead.
        if (get().infoView === 'soil') {
          if (get().soilTool === null) set({ selectedField: fieldAt(game.fields, tile)?.id ?? null });
          return;
        }
        const { buildMode, buildRotation } = get();
        if (buildMode === 'road') {
          const result = roadClick(game, tile);
          if (!result.ok) get().showMessage(ERROR_MESSAGES[result.error], 'error');
          else set({ game: result.state });
          return;
        }
        if (buildMode === 'demolish') {
          const result = demolishClick(game, tile);
          if (!result.ok) {
            get().showMessage(ERROR_MESSAGES[result.error], 'error');
            return;
          }
          set({ game: result.state });
          get().showMessage(demolishText(result.change), 'info');
          return;
        }
        if (buildMode === 'gate') {
          commit(orderGate(game, tile), 'Porteira na fila: a equipe com Obras nas atividades vai construir.');
          return;
        }
        if (buildMode === 'fence') return; // fences are dragged (beginFence / finishFence)
        if (isStructureMode(buildMode)) {
          const { x, y } = tileCoords(tile);
          const at = anchorFor(buildMode, x, y, buildRotation);
          commit(
            orderStructure(game, buildMode, at.x, at.y, buildRotation),
            `Obra de ${label(buildMode).toLowerCase()} na fila: a equipe com Obras nas atividades vai construir.`,
          );
          return;
        }
        if (target.state === 'locked') {
          get().requestPlot(plotOfTile(tile));
          return;
        }
        // Tool orders are given through areas (beginArea / finishArea). With the hand, a click
        // selects the structure on the tile (sites too), and open ground clears the selection.
        if (get().tool === null && target.fence?.gate) {
          const result = toggleGate(game, tile);
          if (!result.ok) get().showMessage(ERROR_MESSAGES[result.error], 'error');
          else {
            set({ game: result.state });
            get().showMessage(result.state.tiles[tile]?.fence?.open ? 'Porteira aberta.' : 'Porteira fechada.', 'info');
          }
          return;
        }
        if (get().tool === null) {
          set({ selectedStructure: target.structure ? (structureAt(game, tile)?.id ?? null) : null, selectedAnimal: null });
        }
      },

      beginArea: (tile) => set({ area: { anchor: tile, current: tile } }),
      extendArea: (tile) => {
        const { area } = get();
        if (area && area.current !== tile) set({ area: { ...area, current: tile } });
      },
      cancelArea: () => set({ area: null }),
      beginFence: (tile) => set({ fenceDrag: { from: tile, to: tile } }),
      extendFence: (tile) => {
        const { fenceDrag } = get();
        if (fenceDrag && fenceDrag.to !== tile) set({ fenceDrag: { ...fenceDrag, to: tile } });
      },
      cancelFence: () => set({ fenceDrag: null }),
      finishFence: () => {
        const { fenceDrag, game } = get();
        if (!fenceDrag) return;
        set({ fenceDrag: null });
        const { from, to } = fenceDrag;
        const before = game.tasks.length;
        const plan = fencePlan(game, from, to);
        const result = orderFenceLine(game, from, to);
        if (!result.ok) {
          get().showMessage(ERROR_MESSAGES[result.error], 'error');
          return;
        }
        set({ game: result.state });
        if (result.state.tasks.length < before) {
          const refund = result.state.money - game.money;
          get().showMessage(refund > 0 ? `Cerca cancelada: +${refund} moedas.` : 'Remoção de cerca cancelada.', 'info');
        }
        else {
          const skipped = plan.blocked.length > 0 ? ` (${plan.blocked.length} ocupado(s) pulado(s))` : '';
          get().showMessage(`Cerca na fila: ${plan.valid.length} tile(s), ${plan.cost} moedas${skipped}.`, 'info');
        }
      },
      finishArea: () => {
        const { area, game, tool, selectedCrop } = get();
        if (!area) return;
        set({ area: null });
        if (tool === null) return;
        if (area.anchor === area.current) {
          const result = toggleTask(game, tool, area.anchor, selectedCrop);
          if (result.ok) set({ game: result.state });
          else get().showMessage(ERROR_MESSAGES[result.error], 'error');
          return;
        }
        const tiles = tilesInRect(area.anchor, area.current);
        const mode = areaMode(game, tool, area.anchor, selectedCrop);
        const result = applyArea(game, tool, tiles, selectedCrop, mode);
        const count = result.changed.length;
        if (count === 0) {
          get().showMessage(result.error ? ERROR_MESSAGES[result.error] : 'Nada para fazer nesta área.', 'error');
          return;
        }
        set({ game: result.state });
        const skipped = result.error ? ` (alguns ficaram de fora: ${ERROR_MESSAGES[result.error].toLowerCase()})` : '';
        get().showMessage(
          mode === 'cancel' ? `${count} ordem(ns) cancelada(s).` : `${count} ordem(ns) na fila${skipped}`,
          'info',
        );
      },

      paintRoadAt: (tile) => {
        const result = orderRoad(get().game, tile);
        if (result.ok) set({ game: result.state });
      },

      setTool: (tool) =>
        set((s) => ({
          ...(tool ? SOIL_VIEW_OFF : {}),
          tool: tool === s.tool ? null : tool,
          buildMode: null,
          area: null,
          selectedStructure: null,
          selectedAnimal: null,
          activitiesOpen: false,
        })),
      selectStructure: (selectedStructure) => set({ selectedStructure, selectedAnimal: null }),
      selectAnimal: (selectedAnimal) => set({ selectedAnimal, selectedStructure: null }),
      setActivitiesOpen: (open) => set((s) => ({ activitiesOpen: open ?? !s.activitiesOpen })),
      upgradeShelter: (id) => {
        const game = get().game;
        const target = game.structures.find((s) => s.id === id);
        const result = orderUpgrade(game, id);
        const toLevel = result.ok ? result.state.structures.find((s) => s.id === id)?.work?.toLevel : undefined;
        if (!target || !toLevel) {
          commit(result);
          return;
        }
        const paid = game.money - (result.ok ? result.state.money : game.money);
        const levelName =
          target.type === 'dock' && (toLevel === 2 || toLevel === 3)
            ? DOCK_LEVELS[toLevel].label.toLowerCase()
            : target.type === 'machineShed' && toLevel === 2
            ? SHED_LEVELS[2].label.toLowerCase()
            : `${label(target.type).toLowerCase()} ${SHELTER_LEVELS[toLevel].label.toLowerCase()}`;
        commit(result, `Reforma na fila: ${levelName} (${paid} moedas). A equipe com Obras vai fazer.`);
      },
      demolishOrCancel: (id) => {
        const target = get().game.structures.find((s) => s.id === id);
        if (!target) return;
        const result = demolishClick(get().game, tileIndex(target.x, target.y));
        if (!result.ok) {
          get().showMessage(ERROR_MESSAGES[result.error], 'error');
          return;
        }
        set({ game: result.state });
        get().showMessage(demolishText(result.change), 'info');
      },
      setBuildMode: (buildMode) =>
        set({ buildMode, selectedStructure: null, selectedAnimal: null, activitiesOpen: false, ...(buildMode ? SOIL_VIEW_OFF : {}) }),
      rotateBuild: () => set((s) => ({ buildRotation: ((s.buildRotation + 1) % 4) as Rotation })),
      setSelectedCrop: (selectedCrop) => set({ selectedCrop, tool: 'seed', buildMode: null, selectedStructure: null }),
      setHoveredTile: (hoveredTile) => {
        if (get().hoveredTile !== hoveredTile) set({ hoveredTile });
      },
      setHoveredAnimal: (hoveredAnimal) => {
        if (get().hoveredAnimal !== hoveredAnimal) set({ hoveredAnimal });
      },
      setSpeed: (speed) => set((s) => ({ settings: { ...s.settings, speed } })),
      togglePause: () =>
        set((s) => ({ settings: { ...s.settings, speed: s.settings.speed === 0 ? 1 : 0 } })),
      setEdgePan: (edgePan) => set((s) => ({ settings: { ...s.settings, edgePan } })),
      setGraphics: (graphics) => set((s) => ({ settings: { ...s.settings, graphics } })),
      openPanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel, ...(panel === 'build' ? SOIL_VIEW_OFF : {}) })),
      showPanel: (panel) => set({ panel }),
      closePanel: () => set({ panel: null }),
      requestPlot: (pendingPlot) => set({ pendingPlot }),

      confirmPlot: () => {
        const { pendingPlot, game } = get();
        if (pendingPlot === null) return;
        if (commit(buyPlot(game, pendingPlot), 'Novo lote comprado!')) set({ pendingPlot: null });
      },

      cart: emptyCart(),
      updateCart: (change) => set((s) => ({ cart: change(s.cart) })),
      clearCart: () => set({ cart: emptyCart() }),
      orderCart: () => {
        if (commit(orderPurchase(get().game, get().cart), '📦 Compra feita: o frete foi chamado e a equipe descarrega na doca.')) {
          set({ cart: emptyCart() });
        }
      },
      orderNow: (cart) => {
        commit(orderPurchase(get().game, cart), '📦 Pedido feito: chega pelo frete e a equipe descarrega na doca.');
      },
      reorderHeld: (heldId) => {
        commit(reorderHeld(get().game, heldId), '📦 Novo frete chamado para a entrega retida.');
      },
      giveUpHeld: (heldId) => {
        const held = get().game.held.find((h) => h.id === heldId);
        commit(giveUpHeld(get().game, heldId), held ? `Entrega abandonada: +${giveUpRefund(held)} moedas.` : undefined);
      },
      setFeedOrder: (auto, days) => {
        commit(setFeedOrder(get().game, auto, days));
      },
      startLoading: (shipmentId) => {
        commit(startLoading(get().game, shipmentId), '📦 Carga na fila: a equipe com Carga nas atividades vai carregar o veículo.');
      },
      cancelLoading: (shipmentId) => {
        commit(cancelLoading(get().game, shipmentId), 'Carga cancelada: a mercadoria voltou ao estoque.');
      },
      dismissShipment: (shipmentId) => {
        const sale = get().game.shipments.find((s) => s.id === shipmentId)?.kind === 'sale';
        commit(
          dismissShipment(get().game, shipmentId),
          sale ? 'Venda cancelada: a mercadoria voltou ao estoque (o frete pago não volta).' : 'O cliente foi dispensado.',
        );
      },
      dockTab: 'bay',
      setDockTab: (dockTab) => set({ dockTab }),
      openDock: (tab) => {
        const dock = docksOf(get().game)[0];
        if (get().panel === 'dock' && !tab) {
          set({ panel: null });
          return;
        }
        set({ panel: 'dock', ...(tab ? { dockTab: tab } : {}), tool: null, buildMode: null, activitiesOpen: false });
        if (dock && get().view === 'farm') {
          const bay = bayPoint(dock);
          get().focusCamera(bay.x, bay.y);
        }
      },
      postListing: (good, price, quantity) => {
        commit(postListing(get().game, good, price, quantity), '📋 Anúncio publicado: as ofertas chegam ao longo do dia.');
      },
      repriceListing: (listingId, price) => {
        commit(repriceListing(get().game, listingId, price));
      },
      removeListing: (listingId) => {
        commit(removeListing(get().game, listingId), 'Anúncio retirado.');
      },
      acceptOffer: (offerId) => {
        commit(acceptOffer(get().game, offerId), '🚚 Negócio fechado: o frete foi chamado e a mercadoria separada.');
      },
      declineOffer: (offerId) => {
        commit(declineOffer(get().game, offerId));
      },
      sendOrder: (orderId) => {
        commit(sendOrder(get().game, orderId), '🚚 Pedido despachado: o frete foi chamado e a mercadoria separada.');
      },
      hireCandidate: (candidateId) => {
        const name = get().game.candidates.find((c) => c.id === candidateId)?.name;
        commit(hireCandidate(get().game, candidateId), name ? `${name} foi contratado(a)!` : undefined);
      },
      hireTemp: () => {
        commit(hireTemp(get().game), 'Esporádico contratado até o fim do expediente.');
      },
      dismiss: (workerId) => {
        const name = get().game.workers.find((w) => w.id === workerId)?.name;
        if (commit(dismissWorker(get().game, workerId), name ? `${name} foi dispensado(a).` : undefined)) {
          if (get().selectedWorker === workerId) set({ selectedWorker: null });
        }
      },
      setPriorities: (workerId, priorities) => {
        commit(setPriorities(get().game, workerId, priorities));
      },
      selectWorker: (selectedWorker) => set(selectedWorker === null ? { selectedWorker } : { selectedWorker, panel: 'workers' }),
      clearTasks: () => set((s) => ({ game: clearTasks(s.game) })),
      markForSale: (animalId) => {
        commit(markForSale(get().game, animalId), '🐄 À venda: a equipe com Tratar animais vai levar ao curral de embarque.');
      },
      unmarkForSale: (animalId) => {
        commit(unmarkForSale(get().game, animalId), 'Tirado da venda: volta para o abrigo.');
      },
      callBuyer: (penId) => {
        commit(callBuyer(get().game, penId), '🚛 Comprador chamado: o caminhão boiadeiro vem ao curral e a equipe embarca.');
      },
      sightings: [],
      showSighting: (predator, x, y) => {
        const now = performance.now() / 1000;
        const fresh = get().sightings.filter((s) => now - s.at < 30);
        set({ sightings: [...fresh, { id: ++sightingCounter, predator, x, y, at: now }] });
      },
      joyride: null,
      startJoyride: (machineId) => {
        const { game, view } = get();
        if (view !== 'farm') return;
        const check = canJoyride(game, machineId);
        if (!check.ok) {
          get().showMessage(ERROR_MESSAGES[check.error], 'error');
          return;
        }
        set({ ...SOIL_VIEW_OFF, joyride: machineId, selectedStructure: null, selectedAnimal: null, panel: null, tool: null, buildMode: null, activitiesOpen: false });
      },
      stopJoyride: (message) => {
        if (get().joyride === null) return;
        set({ joyride: null });
        if (message) get().showMessage(message, 'info');
      },
      view: 'farm',
      goToCity: () => {
        set({
          ...SOIL_VIEW_OFF,
          joyride: null,
          view: 'city',
          tool: null,
          buildMode: null,
          area: null,
          activitiesOpen: false,
          selectedStructure: null,
          selectedAnimal: null,
          hoveredTile: null,
          hoveredAnimal: null,
          pendingPlot: null,
          panel: null,
        });
        get().focusCamera(16, 16, CAMERA.townDistance);
      },
      goToFarm: () => {
        set({ view: 'farm', panel: null });
        get().focusCamera(16, 16, CAMERA.initialDistance);
      },
      openCityShop: (id) => {
        const action = CITY_SHOPS[id].action;
        if (action.panel === 'shop') set({ panel: 'shop', shopTab: action.tab });
        else set({ panel: action.panel });
      },
      shopTab: 'seeds',
      setShopTab: (shopTab) => set({ shopTab }),
      startResearch: (cropId) => {
        const research = CROPS[cropId].research;
        commit(
          startResearch(get().game, cropId),
          research ? `🔬 Pesquisa de ${CROPS[cropId].label.toLowerCase()} começou (${research.hours} h de jogo).` : undefined,
        );
      },
      setFreightVehicle: (choice) => {
        commit(setFreightVehicle(get().game, choice));
      },
      buyMachine: (type) => {
        const def = MACHINES[type];
        commit(buyMachine(get().game, type), `${def.icon} ${def.label} chegou e está na vaga do galpão.`);
      },
      sellMachine: (id) => {
        const m = get().game.machines.find((x) => x.id === id);
        commit(sellMachine(get().game, id), m ? `${MACHINES[m.type].label} vendido(a).` : undefined);
      },
      rentMachine: (type, days, withOperator) => {
        const def = MACHINES[type];
        commit(
          rentMachine(get().game, type, days, withOperator),
          `${def.icon} ${def.label} alugado(a) por ${days} dia${days === 1 ? '' : 's'}${withOperator ? ', com operador' : ''}.`,
        );
      },
      returnRental: (id) => {
        const m = get().game.machines.find((x) => x.id === id);
        commit(returnRental(get().game, id), m ? `${MACHINES[m.type].label} devolvido(a).` : undefined);
      },
      callMechanic: (id) => {
        commit(callMechanic(get().game, id), '🔧 O mecânico levou a máquina: volta consertada amanhã às 6h.');
      },
      upgradeVehicle: () => {
        const game = get().game;
        const next = game.vehicleLevel < 3 ? VEHICLES[(game.vehicleLevel + 1) as 2 | 3] : null;
        commit(upgradeVehicle(game), next ? `${next.icon} Frete contratado: ${next.label.toLowerCase()} (${next.capacity} kg por viagem).` : undefined);
      },
      cameraFocus: null,
      focusCamera: (x, y, distance) =>
        set((s) => ({ cameraFocus: { id: (s.cameraFocus?.id ?? 0) + 1, x, y, ...(distance ? { distance } : {}) } })),
      reportAttacks: (attacks) => {
        const game = get().game;
        for (const attack of attacks) get().showMessage(attackText(game, attack), 'error');
        for (const a of attacks) get().showSighting(a.predator, a.x, a.y);
        const eaten = new Set(attacks.filter((a) => a.outcome === 'eaten').map((a) => a.victim.id));
        const selected = get().selectedAnimal;
        if (selected !== null && eaten.has(selected)) set({ selectedAnimal: null });
      },
      devApply: (transform, message) => {
        set((s) => ({ game: transform(s.game) }));
        if (message) get().showMessage(`🛠️ ${message}`, 'info');
      },
      setDevTimeScale: (devTimeScale) => set({ devTimeScale: Math.max(0, devTimeScale) }),

      save: () => {
        const s = storage();
        if (!s) return;
        const { game, settings } = get();
        if (writeToStorage(s, game, settings)) set({ lastSavedAt: Date.now() });
      },

      newGame: () => {
        const s = storage();
        if (s) clearStorage(s);
        set({
          game: createInitialState(newSoilSeed()),
          tool: null,
          selectedStructure: null,
          selectedAnimal: null,
          selectedCrop: 'wheat',
          panel: null,
          pendingPlot: null,
          buildMode: null,
          area: null,
          selectedWorker: null,
          ...SOIL_VIEW_OFF,
        });
        get().save();
        get().showMessage('Novo jogo iniciado.', 'info');
      },

      showMessage: (text, kind = 'info') => set({ toast: { id: ++toastCounter, text, kind } }),
    };
  }),
);

declare global {
  interface Window {
    /** Dev-only handle for debugging in the browser console. */
    __uvalley?: typeof useGameStore;
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') window.__uvalley = useGameStore;
