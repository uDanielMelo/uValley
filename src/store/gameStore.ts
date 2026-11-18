import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { ANIMALS, type AnimalId, type AnimalProductId } from '../data/animals';
import type { CropId } from '../data/crops';
import { STRUCTURES, type StructureId } from '../data/structures';
import { GAME_MINUTES_PER_REAL_SECOND, type GameSpeed } from '../data/world';
import { buyAnimal, sellAnimal } from '../game/animals';
import { buyPlot, buySeeds, sellAllProduce, sellAnimalProduct, sellProduce } from '../game/economy';
import { plotOfTile, tileCoords, tilesInRect } from '../game/grid';
import {
  DEFAULT_SETTINGS,
  clearStorage,
  loadFromStorage,
  writeToStorage,
  type GraphicsQuality,
  type SaveSettings,
} from '../game/save';
import { demolishClick, orderRoad, orderStructure, roadClick, type DemolishChange } from '../game/construction';
import { advanceGame, type FinishedWork } from '../game/simulation';
import { createInitialState } from '../game/state';
import { anchorFor, refundFor } from '../game/structures';
import { dismissWorker, hireCandidate, hireTemp, setPriorities } from '../game/staff';
import type { ActionError, ActionResult, GameState, Rotation, TaskKind, ToolId } from '../game/types';
import { applyArea, areaMode, clearTasks, toggleTask } from '../game/workers';

export type PanelId = 'shop' | 'inventory' | 'workers' | 'build' | null;

/** Build mode: placing a structure type, painting roads, or demolishing (structures and roads). */
export type BuildMode = StructureId | 'road' | 'demolish' | null;

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

export interface GameStore {
  game: GameState;
  settings: SaveSettings;
  tool: ToolId;
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
  /** Worker whose card is open in the team hub. */
  selectedWorker: number | null;

  advance: (realSeconds: number) => void;
  interactAt: (tile: number) => void;
  /** Area orders: press on a tile, drag, release (a plain click is a 1×1 area). */
  beginArea: (tile: number) => void;
  extendArea: (tile: number) => void;
  finishArea: () => void;
  cancelArea: () => void;
  /** Road painting while dragging: queues road work silently (errors are not shown on every tile). */
  paintRoadAt: (tile: number) => void;
  setTool: (tool: ToolId) => void;
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
  buySeeds: (crop: CropId, quantity: number) => void;
  sell: (crop: CropId, quantity: number) => void;
  sellAll: () => void;
  hireCandidate: (candidateId: number) => void;
  hireTemp: () => void;
  dismiss: (workerId: number) => void;
  setPriorities: (workerId: number, priorities: TaskKind[]) => void;
  /** Opens the team hub on a worker's card (null closes the card). */
  selectWorker: (workerId: number | null) => void;
  clearTasks: () => void;
  buyAnimal: (kind: AnimalId) => void;
  sellAnimal: (kind: AnimalId) => void;
  sellProduct: (product: AnimalProductId, quantity: number) => void;
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
  'already-road': 'Já existe estrada aqui.',
  'no-road': 'Não há nada para demolir aqui.',
  'under-construction': 'Esta construção já está em obra.',
  'no-shelter': 'Construa um abrigo para esta espécie primeiro (menu Construir).',
  'shelter-full': 'Os abrigos desta espécie estão cheios. Construa outro.',
  'pasture-full': 'O pasto está lotado. Compre um lote ou deixe mais grama livre.',
  'shelter-in-use': 'Há animais morando neste abrigo. Venda-os antes de demolir.',
};

const label = (type: StructureId): string => STRUCTURES[type].label;

/** Toast text for what the demolish tool did. */
const demolishText = (change: DemolishChange): string => {
  switch (change.kind) {
    case 'build-cancelled':
      return `Obra de ${label(change.type).toLowerCase()} cancelada: +${change.refund} moedas.`;
    case 'demolish-queued':
      return `Demolição de ${label(change.type).toLowerCase()} na fila: devolve ${refundFor(change.type)} moedas ao terminar.`;
    case 'demolish-cancelled':
      return `Demolição de ${label(change.type).toLowerCase()} cancelada.`;
    case 'road-cancelled':
      return change.refund > 0 ? `Estrada cancelada: +${change.refund} moedas.` : 'Remoção de estrada cancelada.';
    case 'road-removal-queued':
      return 'Remoção da estrada na fila.';
  }
};

/** Toast text for a site or demolition the crew finished. */
const finishedText = (work: FinishedWork): string =>
  work.kind === 'build'
    ? `${label(work.type)} pronto(a)!`
    : `${label(work.type)} demolido(a): +${refundFor(work.type)} moedas.`;

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

let toastCounter = 0;

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
      game: loaded?.game ?? createInitialState(),
      settings: loaded?.settings ?? DEFAULT_SETTINGS,
      tool: 'hoe',
      selectedCrop: 'wheat',
      hoveredTile: null,
      hoveredAnimal: null,
      panel: null,
      pendingPlot: null,
      toast: null,
      lastSavedAt: null,
      devTimeScale: 1,
      buildMode: null,
      buildRotation: 0,
      area: null,
      selectedWorker: null,

      advance: (realSeconds) => {
        const { settings, game, devTimeScale } = get();
        if (settings.speed === 0 || realSeconds <= 0) return;
        const dt = realSeconds * GAME_MINUTES_PER_REAL_SECOND * settings.speed * devTimeScale;
        const { state, workersLeft, hungryAnimals, tempsLeft, worksFinished } = advanceGame(game, dt);
        set({ game: state });
        for (const work of worksFinished) get().showMessage(finishedText(work), 'info');
        if (tempsLeft > 0) get().showMessage('Fim do expediente: os esporádicos foram embora.', 'info');
        if (hungryAnimals > 0) {
          get().showMessage(`Sem dinheiro para a ração: ${hungryAnimals} animal(is) com fome hoje.`, 'error');
        }
        if (workersLeft.length > 0) {
          get().showMessage(`${workersLeft.join(', ')} foi embora: faltou dinheiro para o salário.`, 'error');
        }
      },

      interactAt: (tile) => {
        const { game } = get();
        const target = game.tiles[tile];
        if (!target) return;
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
        if (buildMode) {
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
        if (target.structure === 'shippingBin') set({ panel: 'inventory' });
        // Tool orders are given through areas (beginArea / finishArea).
      },

      beginArea: (tile) => set({ area: { anchor: tile, current: tile } }),
      extendArea: (tile) => {
        const { area } = get();
        if (area && area.current !== tile) set({ area: { ...area, current: tile } });
      },
      cancelArea: () => set({ area: null }),
      finishArea: () => {
        const { area, game, tool, selectedCrop } = get();
        if (!area) return;
        set({ area: null });
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

      setTool: (tool) => set({ tool, buildMode: null, area: null }),
      setBuildMode: (buildMode) => set({ buildMode }),
      rotateBuild: () => set((s) => ({ buildRotation: ((s.buildRotation + 1) % 4) as Rotation })),
      setSelectedCrop: (selectedCrop) => set({ selectedCrop, tool: 'seed' }),
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
      openPanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel })),
      showPanel: (panel) => set({ panel }),
      closePanel: () => set({ panel: null }),
      requestPlot: (pendingPlot) => set({ pendingPlot }),

      confirmPlot: () => {
        const { pendingPlot, game } = get();
        if (pendingPlot === null) return;
        if (commit(buyPlot(game, pendingPlot), 'Novo lote comprado!')) set({ pendingPlot: null });
      },

      buySeeds: (crop, quantity) => {
        commit(buySeeds(get().game, crop, quantity));
      },
      sell: (crop, quantity) => {
        commit(sellProduce(get().game, crop, quantity));
      },
      sellAll: () => {
        commit(sellAllProduce(get().game), 'Tudo vendido!');
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
      buyAnimal: (kind) => {
        const before = get().game;
        if (!commit(buyAnimal(before, kind))) return;
        const animal = get().game.animals[get().game.animals.length - 1];
        const home = get().game.structures.find((s) => s.id === animal?.shelterId);
        if (home) get().showMessage(`${ANIMALS[kind].label} comprado(a): mora no ${STRUCTURES[home.type].label.toLowerCase()}.`, 'info');
      },
      sellAnimal: (kind) => {
        commit(sellAnimal(get().game, kind));
      },
      sellProduct: (product, quantity) => {
        commit(sellAnimalProduct(get().game, product, quantity));
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
          game: createInitialState(),
          tool: 'hoe',
          selectedCrop: 'wheat',
          panel: null,
          pendingPlot: null,
          buildMode: null,
          area: null,
          selectedWorker: null,
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
