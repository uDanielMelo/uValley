import { useMemo } from 'react';
import { taskMinutes } from '../game/workers';
import type { GameState } from '../game/types';
import { useGameStore } from '../store/gameStore';

/** Plowing shows in steps of this share, so the layers only rebuild a few times per tile. */
const STEP = 0.1;

/**
 * "tile:steps" for every plowing task under way (the work kept on the task, or the plowman's own),
 * as a string so the selector only changes when a tile reaches a new step.
 */
const plowKey = (game: GameState): string => {
  const parts: string[] = [];
  for (const task of game.tasks) {
    if (task.kind !== 'hoe') continue;
    const worker = task.workerId === null ? undefined : game.workers.find((w) => w.id === task.workerId);
    const done = Math.max(task.done ?? 0, worker?.taskId === task.id ? worker.progress : 0);
    if (done <= 0) continue;
    const steps = Math.floor((done / taskMinutes(task, game.soilSeed, game.tiles)) / STEP);
    if (steps > 0) parts.push(`${task.tile}:${steps}`);
  }
  return parts.join(',');
};

/** Tiles being plowed and how far along (0–1, in STEP steps). */
export const usePlowProgress = (): ReadonlyMap<number, number> => {
  const key = useGameStore((s) => plowKey(s.game));
  return useMemo(() => {
    const map = new Map<number, number>();
    for (const part of key.split(',').filter(Boolean)) {
      const [tile = '0', steps = '0'] = part.split(':');
      map.set(Number(tile), Math.min(1, Number(steps) * STEP));
    }
    return map;
  }, [key]);
};
