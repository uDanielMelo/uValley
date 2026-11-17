import { useGameStore } from '../store/gameStore';
import { BuildBanner, BuildPanel } from './BuildPanel';
import { DevPanel } from './DevPanel';
import { DEV_ENABLED } from './devTools';
import { useAutosave } from './hooks/useAutosave';
import { useHotkeys } from './hooks/useHotkeys';
import { HoverInfo } from './HoverInfo';
import { InventoryPanel } from './InventoryPanel';
import { PlotDialog } from './PlotDialog';
import { Card } from './primitives';
import { ShopPanel } from './ShopPanel';
import { Toast } from './Toast';
import { Toolbar } from './Toolbar';
import { WorkersPanel } from './WorkersPanel';
import { TopBar } from './TopBar';

function ControlsHint() {
  return (
    <Card className="px-3 py-2 text-xs leading-relaxed font-bold text-wood/80">
      <p>
        <b>Clique</b>: dar uma ordem (de novo cancela)
      </p>
      <p>
        <b>Botão direito</b> + arrastar: mover câmera
      </p>
      <p>
        <b>Botão do meio</b> (ou <b>Shift</b> + direito) + arrastar: girar · <b>Z/X</b>: girar
      </p>
      <p>
        <b>Roda</b>: zoom · <b>Espaço</b>: pausar · <b>T</b>: equipe · <b>B</b>: construir
      </p>
    </Card>
  );
}

/** HUD overlay. The container ignores pointer events so the canvas still receives them. */
export function Hud() {
  useHotkeys();
  useAutosave();
  const panel = useGameStore((s) => s.panel);
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <TopBar />
      <div className="flex justify-center">
        <Toast />
      </div>
      <div className="flex flex-1 items-start justify-end p-3">
        {panel === 'shop' && <ShopPanel />}
        {panel === 'inventory' && <InventoryPanel />}
        {panel === 'workers' && <WorkersPanel />}
        {panel === 'build' && <BuildPanel />}
      </div>
      <div className="flex items-end justify-between gap-3 p-3">
        <div className="w-64">
          <HoverInfo />
        </div>
        <div className="flex flex-col items-center gap-2">
          <BuildBanner />
          <Toolbar />
        </div>
        <div className="flex w-64 justify-end">
          <ControlsHint />
        </div>
      </div>
      <PlotDialog />
      {DEV_ENABLED && <DevPanel />}
    </div>
  );
}
