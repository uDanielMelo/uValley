import { useEffect } from 'react';
import { CROP_IDS } from '../../data/crops';
import { useGameStore } from '../../store/gameStore';
import { TOOLS } from '../tools';

/** Global keyboard shortcuts: 1–4 tools, Q/E cycle seeds, Space pause, L shop, I inventory, T workers, Esc close. */
export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const store = useGameStore.getState();

      const tool = TOOLS.find((t) => t.key === e.key);
      if (tool) {
        store.setTool(tool.id);
        return;
      }
      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          store.togglePause();
          break;
        case 'l':
          store.openPanel('shop');
          break;
        case 'i':
          store.openPanel('inventory');
          break;
        case 't':
          store.openPanel('workers');
          break;
        case 'q':
        case 'e': {
          const step = e.key.toLowerCase() === 'e' ? 1 : -1;
          const current = CROP_IDS.indexOf(store.selectedCrop);
          const next = CROP_IDS[(current + step + CROP_IDS.length) % CROP_IDS.length];
          if (next) store.setSelectedCrop(next);
          break;
        }
        case 'escape':
          if (store.pendingPlot !== null) store.requestPlot(null);
          else store.closePanel();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
