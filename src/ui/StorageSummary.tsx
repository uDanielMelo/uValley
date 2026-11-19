import { useGameStore } from '../store/gameStore';
import { storageUse } from '../game/storage';
import { OPEN_AIR_SPOILAGE, PANTRY_CAPACITY } from '../data/storage';

function Meter({ label, used, capacity, title }: { label: string; used: number; capacity: number; title: string }) {
  const share = capacity > 0 ? Math.min(100, (used / capacity) * 100) : 100;
  const full = used > capacity;
  return (
    <div title={title}>
      <div className="flex justify-between">
        <span>{label}</span>
        <span className={`tabular-nums ${full ? 'text-red-700' : ''}`}>
          {used}/{capacity}
        </span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-wood/20">
        <div className={`h-full ${full ? 'bg-red-700' : 'bg-leaf'}`} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

/** How full the farm's storage is: general, silos and cold rooms, and what is left in the open. */
export function StorageSummary() {
  // Primitive selectors: re-render only when the numbers change.
  const general = useGameStore((s) => storageUse(s.game).generalUsed);
  const generalCap = useGameStore((s) => storageUse(s.game).capacity.general);
  const grain = useGameStore((s) => storageUse(s.game).grainUsed);
  const grainCap = useGameStore((s) => storageUse(s.game).capacity.grain);
  const cold = useGameStore((s) => storageUse(s.game).coldUsed);
  const coldCap = useGameStore((s) => storageUse(s.game).capacity.cold);
  const openAir = useGameStore((s) => storageUse(s.game).openAir);
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-parchment-dark/60 p-3 text-xs font-bold">
      <Meter
        label="📦 Estoque"
        used={general}
        capacity={generalCap}
        title={`Despensa da casa (${PANTRY_CAPACITY}) mais armazéns e celeiros`}
      />
      {grainCap > 0 && (
        <Meter label="🌾 Silos (grãos)" used={grain} capacity={grainCap} title="Trigo e milho no silo não estragam" />
      )}
      {coldCap > 0 && (
        <Meter label="🧊 Câmara fria" used={cold} capacity={coldCap} title="Perecíveis na câmara fria não estragam" />
      )}
      {openAir > 0 ? (
        <p className="text-red-700">
          {openAir} ao relento: perdem {Math.round(OPEN_AIR_SPOILAGE * 100)}% ou mais por noite. Venda ou construa armazém,
          celeiro ou silo.
        </p>
      ) : (
        <p className="text-wood/70">Perecíveis (tomate, ovos, leite, trufa) estragam um pouco a cada noite.</p>
      )}
    </div>
  );
}
