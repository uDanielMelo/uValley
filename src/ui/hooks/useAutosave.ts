import { useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';

const AUTOSAVE_INTERVAL_MS = 30_000;

/** Periodic autosave plus a save when the tab is hidden or closed. */
export function useAutosave(): void {
  useEffect(() => {
    const save = () => useGameStore.getState().save();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') save();
    };
    const interval = window.setInterval(save, AUTOSAVE_INTERVAL_MS);
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('beforeunload', save);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
