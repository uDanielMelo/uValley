import { useEffect } from 'react';
import { CROP_IDS } from '../../data/crops';
import { isStructureMode, useGameStore } from '../../store/gameStore';
import { TOOLS } from '../tools';

/**
 * Global keyboard shortcuts: H hand, 1–5 order tools (again: back to the hand), Q/E cycle seeds,
 * Space pause, L shop, I inventory, T workers, B build menu, C town and back, R rotate the
 * structure being placed, Esc steps back (area, plot, build mode, hub, selection, panel, tool, town).
 */
export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const store = useGameStore.getState();

      const inTown = store.view === 'city';
      if (e.key.toLowerCase() === 'c') {
        if (inTown) store.goToFarm();
        else store.goToCity();
        return;
      }
      const tool = TOOLS.find((t) => t.key === e.key);
      if (tool && !inTown) {
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
        case 'v':
          store.openDock();
          break;
        case 'b':
          if (!inTown) store.openPanel('build');
          break;
        case 'r':
          if (isStructureMode(store.buildMode)) store.rotateBuild();
          break;
        case 'q':
        case 'e': {
          const step = e.key.toLowerCase() === 'e' ? 1 : -1;
          const known = CROP_IDS.filter((id) => store.game.research.unlocked.includes(id));
          const current = known.indexOf(store.selectedCrop);
          const next = known[(current + step + known.length) % known.length];
          if (next) store.setSelectedCrop(next);
          break;
        }
        case 'escape':
          if (store.fenceDrag) store.cancelFence();
          else if (store.area) store.cancelArea();
          else if (store.pendingPlot !== null) store.requestPlot(null);
          else if (store.buildMode) store.setBuildMode(null);
          else if (store.activitiesOpen) store.setActivitiesOpen(false);
          else if (store.selectedStructure !== null) store.selectStructure(null);
          else if (store.selectedAnimal !== null) store.selectAnimal(null);
          else if (store.panel) store.closePanel();
          else if (store.tool !== null) store.setTool(null);
          else if (inTown) store.goToFarm();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
