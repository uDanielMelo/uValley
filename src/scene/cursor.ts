import { useGameStore } from '../store/gameStore';

/**
 * One place decides the mouse cursor over the game: grabbing while the hand drags the camera,
 * a pointer over something clickable, an open hand in hand mode, the default otherwise.
 */
const cursor = { hovering: false, dragging: false };

const handMode = (): boolean => {
  const { tool, buildMode } = useGameStore.getState();
  return tool === null && buildMode === null;
};

export const refreshCursor = (): void => {
  const value = cursor.dragging ? 'grabbing' : cursor.hovering ? 'pointer' : handMode() ? 'grab' : '';
  if (document.body.style.cursor !== value) document.body.style.cursor = value;
};

/** Something clickable is under the mouse (call with false when it leaves). */
export const setHoverCursor = (on: boolean): void => {
  cursor.hovering = on;
  refreshCursor();
};

export const setDragCursor = (on: boolean): void => {
  cursor.dragging = on;
  refreshCursor();
};

// Switching tools or build mode changes the idle cursor.
useGameStore.subscribe(
  (s) => s.tool === null && s.buildMode === null,
  () => refreshCursor(),
);
