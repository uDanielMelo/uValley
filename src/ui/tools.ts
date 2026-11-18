import { STRUCTURES } from '../data/structures';
import type { GameState, Task, TaskKind, ToolId } from '../game/types';

export interface ToolInfo {
  id: ToolId;
  label: string;
  hint: string;
  icon: string;
  key: string;
}

/** Toolbar order defines the 1–4 hotkeys. */
export const TOOLS: readonly ToolInfo[] = [
  { id: 'hoe', label: 'Enxada', hint: 'Mandar arar a grama', icon: '⛏️', key: '1' },
  { id: 'seed', label: 'Semente', hint: 'Mandar plantar em terra arada', icon: '🌱', key: '2' },
  { id: 'water', label: 'Regador', hint: 'Mandar regar (dura até o fim do dia)', icon: '💧', key: '3' },
  { id: 'hand', label: 'Colher', hint: 'Mandar colher plantas maduras', icon: '✋', key: '4' },
];

/** Activity names (pt-BR), e.g. for priorities and the queue. */
export const TASK_LABELS: Record<TaskKind, string> = {
  hoe: 'Arar',
  seed: 'Plantar',
  water: 'Regar',
  hand: 'Colher',
  build: 'Obras',
};

export const TASK_ICONS: Record<TaskKind, string> = {
  hoe: '⛏️',
  seed: '🌱',
  water: '💧',
  hand: '✋',
  build: '🔨',
};

/** Ongoing-action verbs (pt-BR) for worker status. */
export const TASK_VERBS: Record<TaskKind, string> = {
  hoe: 'Arando',
  seed: 'Plantando',
  water: 'Regando',
  hand: 'Colhendo',
  build: 'Em obra',
};

/** What a construction task is about: [label, ongoing verb] (pt-BR). */
const buildTaskWords = (game: GameState, task: Task): [string, string] => {
  const job = task.job;
  if (job?.type === 'road') return job.remove ? ['Remover estrada', 'Removendo estrada'] : ['Abrir estrada', 'Abrindo estrada'];
  const site = job ? game.structures.find((s) => s.id === job.structureId) : undefined;
  if (!site) return [TASK_LABELS.build, TASK_VERBS.build];
  const name = STRUCTURES[site.type].label.toLowerCase();
  return site.work?.kind === 'demolish' ? [`Demolir ${name}`, `Demolindo ${name}`] : [`Construir ${name}`, `Construindo ${name}`];
};

/** Name of a queued task, e.g. "Regar" or "Construir galinheiro". */
export const taskLabel = (game: GameState, task: Task): string =>
  task.kind === 'build' ? buildTaskWords(game, task)[0] : TASK_LABELS[task.kind];

/** What a worker doing the task is doing, e.g. "Regando" or "Construindo galinheiro". */
export const taskVerb = (game: GameState, task: Task): string =>
  task.kind === 'build' ? buildTaskWords(game, task)[1] : TASK_VERBS[task.kind];
