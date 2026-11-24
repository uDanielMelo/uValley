import { ANIMALS } from '../data/animals';
import { STRUCTURES } from '../data/structures';
import type { GameState, Task, TaskKind, ToolId } from '../game/types';

export interface ToolInfo {
  id: ToolId;
  label: string;
  hint: string;
  icon: string;
  key: string;
}

/** Toolbar order defines the 1–5 hotkeys. */
export const TOOLS: readonly ToolInfo[] = [
  { id: 'hoe', label: 'Enxada', hint: 'Mandar arar a grama', icon: '⛏️', key: '1' },
  { id: 'seed', label: 'Semente', hint: 'Mandar plantar em terra arada', icon: '🌱', key: '2' },
  { id: 'water', label: 'Regador', hint: 'Mandar regar (dura até o fim do dia)', icon: '💧', key: '3' },
  { id: 'hand', label: 'Colher', hint: 'Mandar colher plantas maduras', icon: '🧺', key: '4' },
  {
    id: 'fertilize',
    label: 'Adubo',
    hint: 'Mandar adubar terra arada ou plantada (cresce mais rápido e pode render mais)',
    icon: '💩',
    key: '5',
  },
];

/** Activity names (pt-BR), e.g. for priorities and the queue. */
export const TASK_LABELS: Record<TaskKind, string> = {
  hoe: 'Arar',
  seed: 'Plantar',
  water: 'Regar',
  hand: 'Colher',
  fertilize: 'Adubar',
  tend: 'Tratar animais',
  build: 'Obras',
  haul: 'Carga',
};

export const TASK_ICONS: Record<TaskKind, string> = {
  hoe: '⛏️',
  seed: '🌱',
  water: '💧',
  hand: '🧺',
  fertilize: '💩',
  tend: '🪣',
  build: '🔨',
  haul: '📦',
};

/** Ongoing-action verbs (pt-BR) for worker status. */
export const TASK_VERBS: Record<TaskKind, string> = {
  hoe: 'Arando',
  seed: 'Plantando',
  water: 'Regando',
  hand: 'Colhendo',
  fertilize: 'Adubando',
  tend: 'Cuidando dos animais',
  build: 'Em obra',
  haul: 'Carregando',
};

/** What a construction or animal care task is about: [label, ongoing verb] (pt-BR). */
const jobWords = (game: GameState, task: Task): [string, string] => {
  const job = task.job;
  if (job?.type === 'road') return job.remove ? ['Remover estrada', 'Removendo estrada'] : ['Abrir estrada', 'Abrindo estrada'];
  if (job?.type === 'medicate') {
    const animal = game.animals.find((a) => a.id === job.animalId);
    const name = animal ? ANIMALS[animal.kind].label.toLowerCase() : 'animal';
    return [`Medicar ${name}`, `Medicando ${name}`];
  }
  if (job?.type === 'carcass') return ['Recolher carcaça', 'Recolhendo carcaça'];
  if (job?.type === 'herd') {
    const animal = game.animals.find((a) => a.id === job.animalId);
    const name = animal ? ANIMALS[animal.kind].label.toLowerCase() : 'animal';
    return [`Levar ${name} ao curral`, `Levando ${name} ao curral`];
  }
  if (job?.type === 'shipment') return ['Carregar veículo na doca', 'Carregando veículo na doca'];
  const target = job ? game.structures.find((s) => s.id === job.structureId) : undefined;
  if (!target) return [TASK_LABELS[task.kind], TASK_VERBS[task.kind]];
  const name = STRUCTURES[target.type].label.toLowerCase();
  if (job?.type === 'shelter') return [`Coletar no ${name}`, `Coletando no ${name}`];
  if (target.work?.kind === 'upgrade') return [`Reformar ${name}`, `Reformando ${name}`];
  return target.work?.kind === 'demolish' ? [`Demolir ${name}`, `Demolindo ${name}`] : [`Construir ${name}`, `Construindo ${name}`];
};

/** Name of a queued task, e.g. "Regar" or "Construir galinheiro". */
export const taskLabel = (game: GameState, task: Task): string =>
  task.job ? jobWords(game, task)[0] : TASK_LABELS[task.kind];

/** What a worker doing the task is doing, e.g. "Regando" or "Coletando no galinheiro". */
export const taskVerb = (game: GameState, task: Task): string =>
  task.job ? jobWords(game, task)[1] : TASK_VERBS[task.kind];
