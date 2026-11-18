import { useEffect } from 'react';
import { CROP_IDS } from '../../data/crops';
import { useGameStore } from '../../store/gameStore';
import { TOOLS } from '../tools';

/**
 * Global keyboard shortcuts: H hand, 1–4 order tools (again: back to the hand), Q/E cycle seeds,
 * Space pause, L shop, I inventory, T workers, B build menu, R rotate the structure being placed,
 * Esc steps back (area, plot, build mode, hub, selection, panel, tool).
 */
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
        case 'h':
          store.setTool(null);
          store.setBuildMode(null);
          break;
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
        case 'b':
          store.openPanel('build');
          break;
        case 'r':
          if (store.buildMode && store.buildMode !== 'demolish' && store.buildMode !== 'road') store.rotateBuild();
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
          if (store.area) store.cancelArea();
          else if (store.pendingPlot !== null) store.requestPlot(null);
          else if (store.buildMode) store.setBuildMode(null);
          else if (store.activitiesOpen) store.setActivitiesOpen(false);
          else if (store.selectedStructure !== null) store.selectStructure(null);
          else if (store.panel) store.closePanel();
          else if (store.tool !== null) store.setTool(null);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
