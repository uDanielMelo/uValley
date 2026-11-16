import { CROPS, CROP_IDS } from '../data/crops';
import { useGameStore } from '../store/gameStore';
import { Card } from './primitives';
import { TOOLS } from './tools';

function SeedPicker() {
  const selected = useGameStore((s) => s.selectedCrop);
  const seeds = useGameStore((s) => s.game.inventory.seeds);
  const select = useGameStore((s) => s.setSelectedCrop);
  return (
    <Card className="flex items-center gap-1 p-1.5">
      <span className="px-2 text-xs font-black text-wood/70">Q / E</span>
      {CROP_IDS.map((id) => {
        const count = seeds[id] ?? 0;
        const active = id === selected;
        return (
          <button
            key={id}
            type="button"
            onClick={() => select(id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm font-extrabold ${
              active ? 'bg-leaf text-white' : 'hover:bg-parchment-dark'
            } ${count === 0 ? 'opacity-50' : ''}`}
          >
            <span aria-hidden>{CROPS[id].icon}</span>
            {CROPS[id].label}
            <span className={`rounded px-1 text-xs tabular-nums ${active ? 'bg-white/25' : 'bg-wood/15'}`}>
              {count}
            </span>
          </button>
        );
      })}
    </Card>
  );
}

export function Toolbar() {
  const tool = useGameStore((s) => s.tool);
  const setTool = useGameStore((s) => s.setTool);
  return (
    <div className="flex flex-col items-center gap-2">
      {tool === 'seed' && <SeedPicker />}
      <Card className="flex gap-2 p-2">
        {TOOLS.map((t) => {
          const active = t.id === tool;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTool(t.id)}
              title={`${t.label}: ${t.hint} (${t.key})`}
              className={`relative flex w-20 flex-col items-center rounded-xl border-2 px-2 pt-1.5 pb-1 transition ${
                active
                  ? '-translate-y-1 border-wood bg-coin/40 shadow-[0_4px_0_rgba(94,59,31,0.5)]'
                  : 'border-transparent hover:bg-parchment-dark'
              }`}
            >
              <span className="absolute top-0.5 left-1.5 text-xs font-black text-wood/60">{t.key}</span>
              <span className="text-2xl" aria-hidden>
                {t.icon}
              </span>
              <span className="text-xs font-extrabold">{t.label}</span>
            </button>
          );
        })}
      </Card>
    </div>
  );
}
