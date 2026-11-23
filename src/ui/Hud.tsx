import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { AnimalCard } from './AnimalCard';
import { BuildBanner, BuildPanel } from './BuildPanel';
import { DevPanel } from './DevPanel';
import { DockPanel } from './DockPanel';
import { GaragePanel } from './GaragePanel';
import { MarketPanel } from './MarketPanel';
import { DEV_ENABLED } from './devTools';
import { Dock } from './Dock';
import { useAutosave } from './hooks/useAutosave';
import { useHotkeys } from './hooks/useHotkeys';
import { HoverInfo } from './HoverInfo';
import { InventoryPanel } from './InventoryPanel';
import { PlotDialog } from './PlotDialog';
import { Card } from './primitives';
import { ShopPanel } from './ShopPanel';
import { StructureCard } from './StructureCard';
import { Toast } from './Toast';
import { TopBar } from './TopBar';
import { WorkersPanel } from './WorkersPanel';

const CONTROLS: readonly [string, string][] = [
  ['✋ Mão', 'arraste para mover a câmera, clique para selecionar'],
  ['Atividade', 'clique ou arraste uma área para dar ordens'],
  ['Botão direito', 'arrastar move a câmera'],
  ['Meio ou Shift + direito', 'girar (ou Z/X)'],
  ['Roda', 'zoom'],
  ['Atalhos', 'H mão · 1–5 atividades · B construir · V doca · C cidade · T equipe · L loja · I inventário · Espaço pausa'],
];

/** Controls help, folded into a small "?" button. */
function ControlsHint() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-end gap-2">
      {open && (
        <Card className="w-72 px-3 py-2 text-xs leading-relaxed font-bold text-wood/80">
          {CONTROLS.map(([key, text]) => (
            <p key={key}>
              <b className="text-wood-dark">{key}</b>: {text}
            </p>
          ))}
        </Card>
      )}
      <Card className="p-0.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title="Controles"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-base font-black hover:bg-parchment-dark"
        >
          ?
        </button>
      </Card>
    </div>
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
        {panel === 'market' && <MarketPanel />}
        {panel === 'garage' && <GaragePanel />}
        {panel === 'dock' && <DockPanel />}
      </div>
      <div className="flex items-end justify-between gap-3 p-3">
        <div className="flex w-72 flex-col justify-end gap-2">
          <HoverInfo />
          <StructureCard />
          <AnimalCard />
        </div>
        <div className="flex flex-col items-center gap-2">
          <BuildBanner />
          <Dock />
        </div>
        <div className="flex w-72 justify-end">
          <ControlsHint />
        </div>
      </div>
      <PlotDialog />
      {DEV_ENABLED && <DevPanel />}
    </div>
  );
}
