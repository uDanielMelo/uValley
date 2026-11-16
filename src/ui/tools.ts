import type { ToolId } from '../game/types';

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

/** Task names (pt-BR), e.g. for the queue. */
export const TASK_LABELS: Record<ToolId, string> = {
  hoe: 'Arar',
  seed: 'Plantar',
  water: 'Regar',
  hand: 'Colher',
};

/** Ongoing-action verbs (pt-BR) for worker status. */
export const TASK_VERBS: Record<ToolId, string> = {
  hoe: 'Arando',
  seed: 'Plantando',
  water: 'Regando',
  hand: 'Colhendo',
};
