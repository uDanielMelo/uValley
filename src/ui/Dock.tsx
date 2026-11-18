import { CROPS, CROP_IDS } from '../data/crops';
import { useGameStore } from '../store/gameStore';
import { Card } from './primitives';
import { TASK_LABELS, TOOLS } from './tools';

function SeedChips() {
  const selected = useGameStore((s) => s.selectedCrop);
  const tool = useGameStore((s) => s.tool);
  const seeds = useGameStore((s) => s.game.inventory.seeds);
  const select = useGameStore((s) => s.setSelectedCrop);
  return (
    <div className="flex items-center gap-1">
      {CROP_IDS.map((id) => {
        const count = seeds[id] ?? 0;
        const active = tool === 'seed' && id === selected;
        return (
          <button
            key={id}
            type="button"
            onClick={() => select(id)}
            title={`Plantar ${CROPS[id].label.toLowerCase()} (Q/E troca)`}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-extrabold ${
              active ? 'bg-leaf text-white' : 'hover:bg-parchment-dark'
            } ${count === 0 ? 'opacity-50' : ''}`}
          >
            <span aria-hidden>{CROPS[id].icon}</span>
            <span className="tabular-nums">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The order tools (till, plant, water, harvest) and the seeds, opened from the dock. */
function ActivitiesHub() {
  const tool = useGameStore((s) => s.tool);
  const setTool = useGameStore((s) => s.setTool);
  return (
    <Card className="flex flex-col gap-2 p-2">
      <div className="grid grid-cols-4 gap-1">
        {TOOLS.map((t) => {
          const active = t.id === tool;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTool(t.id)}
              title={`${t.hint} (${t.key})`}
              className={`flex w-16 flex-col items-center rounded-xl py-1.5 text-xs font-extrabold transition ${
                active ? 'bg-coin/50 ring-2 ring-wood/60' : 'hover:bg-parchment-dark'
              }`}
            >
              <span className="text-xl" aria-hidden>
                {t.icon}
              </span>
              {TASK_LABELS[t.id]}
              <span className="text-[10px] text-wood/50">{t.key}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t-2 border-wood/10 pt-1.5">
        <span className="px-1 text-[11px] font-black text-wood/60">Sementes</span>
        <SeedChips />
      </div>
    </Card>
  );
}

/** While an order tool is active: what it does, and the seeds when planting. */
function ActiveTool() {
  const tool = useGameStore((s) => s.tool);
  const open = useGameStore((s) => s.activitiesOpen);
  const info = TOOLS.find((t) => t.id === tool);
  if (!info || open) return null;
  return (
    <Card className="flex items-center gap-2 px-3 py-1 text-xs font-extrabold">
      <span>
        {info.icon} {TASK_LABELS[info.id]}: clique ou arraste uma área
      </span>
      {tool === 'seed' && <SeedChips />}
      <span className="text-wood/50">Esc: mão</span>
    </Card>
  );
}

interface DockButtonProps {
  icon: string;
  label: string;
  hotkey: string;
  active: boolean;
  onClick: () => void;
  expanded?: boolean;
}

function DockButton({ icon, label, hotkey, active, onClick, expanded }: DockButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label} (${hotkey})`}
      aria-expanded={expanded}
      className={`flex h-12 min-w-14 flex-col items-center justify-center rounded-xl px-2 text-[11px] font-extrabold transition ${
        active ? 'bg-coin/50 ring-2 ring-wood/60' : 'hover:bg-parchment-dark'
      }`}
    >
      <span className="text-xl leading-6" aria-hidden>
        {icon}
      </span>
      {label}
    </button>
  );
}

/**
 * Minimal bottom dock: the hand (move the camera, select), the activities hub and the build menu.
 */
export function Dock() {
  const tool = useGameStore((s) => s.tool);
  const building = useGameStore((s) => s.buildMode !== null || s.panel === 'build');
  const open = useGameStore((s) => s.activitiesOpen);
  const setTool = useGameStore((s) => s.setTool);
  const setOpen = useGameStore((s) => s.setActivitiesOpen);
  const setBuildMode = useGameStore((s) => s.setBuildMode);
  const openPanel = useGameStore((s) => s.openPanel);
  const current = TOOLS.find((t) => t.id === tool);
  return (
    <div className="flex flex-col items-center gap-2">
      {open && <ActivitiesHub />}
      <ActiveTool />
      <Card className="flex items-center gap-1 p-1">
        <DockButton
          icon="✋"
          label="Mão"
          hotkey="H"
          active={tool === null && !building && !open}
          onClick={() => {
            setTool(null);
            setBuildMode(null);
          }}
        />
        <span className="h-8 w-px bg-wood/20" aria-hidden />
        <DockButton
          icon={current?.icon ?? '🧑‍🌾'}
          label={current ? TASK_LABELS[current.id] : 'Atividades'}
          hotkey="1–4"
          active={tool !== null || open}
          expanded={open}
          onClick={() => setOpen()}
        />
        <DockButton icon="🔨" label="Construir" hotkey="B" active={building} onClick={() => openPanel('build')} />
      </Card>
    </div>
  );
}
