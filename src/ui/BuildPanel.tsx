import { BUILDABLE_IDS, CATEGORY_LABELS, DEMOLISH_REFUND, STRUCTURES, type StructureCategory, type StructureId } from '../data/structures';
import { ROAD_COST, ROAD_WALK_BONUS } from '../data/roads';
import { buildMinutesFor } from '../game/structures';
import { useGameStore } from '../store/gameStore';
import { formatCoins, formatWorkTime } from './format';
import { Button, Card, Coins, Panel } from './primitives';

const CATEGORIES: readonly StructureCategory[] = ['housing', 'farming', 'animals', 'storage', 'decor'];


function StructureRow({ id }: { id: StructureId }) {
  const def = STRUCTURES[id];
  const cost = def.cost ?? 0;
  const money = useGameStore((s) => s.game.money);
  const active = useGameStore((s) => s.buildMode === id);
  const setBuildMode = useGameStore((s) => s.setBuildMode);
  return (
    <li>
      <button
        type="button"
        disabled={money < cost}
        onClick={() => setBuildMode(active ? null : id)}
        className={`w-full rounded-xl border-2 p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
          active ? 'border-wood bg-coin/40' : 'border-transparent bg-parchment-dark/60 hover:bg-parchment-dark'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-base font-black">
            {def.icon} {def.label}
          </span>
          <Coins value={formatCoins(cost)} className={money < cost ? 'text-red-700' : ''} />
        </div>
        <p className="mt-0.5 text-xs font-bold text-wood/80">
          {def.description}
          {def.shelter && ` ${def.shelter.capacity} vagas.`} · {def.width}×{def.depth} tiles · obra de{' '}
          {formatWorkTime(buildMinutesFor(id))}
        </p>
      </button>
    </li>
  );
}

function RoadRow() {
  const money = useGameStore((s) => s.game.money);
  const active = useGameStore((s) => s.buildMode === 'road');
  const setBuildMode = useGameStore((s) => s.setBuildMode);
  return (
    <button
      type="button"
      disabled={money < ROAD_COST}
      onClick={() => setBuildMode(active ? null : 'road')}
      className={`w-full rounded-xl border-2 p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? 'border-wood bg-coin/40' : 'border-transparent bg-parchment-dark/60 hover:bg-parchment-dark'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-base font-black">🛤️ Estrada de terra</span>
        <span className="flex items-center gap-1 text-sm font-black">
          <Coins value={formatCoins(ROAD_COST)} className={money < ROAD_COST ? 'text-red-700' : ''} /> / tile
        </span>
      </div>
      <p className="mt-0.5 text-xs font-bold text-wood/80">
        Clique e arraste para traçar; a equipe abre cada trecho. Ela anda {Math.round(ROAD_WALK_BONUS * 100)}% mais
        rápido na estrada, e o carro segue as estradas até a caixa de venda.
      </p>
    </button>
  );
}

/** Build menu: pick a structure to place, or switch to demolition. */
export function BuildPanel() {
  const close = useGameStore((s) => s.closePanel);
  const demolishing = useGameStore((s) => s.buildMode === 'demolish');
  const setBuildMode = useGameStore((s) => s.setBuildMode);
  return (
    <Panel title="🔨 Construir" onClose={close}>
      <div className="flex flex-col gap-4">
        {CATEGORIES.map((category) => (
          <section key={category}>
            <h3 className="mb-2 text-sm font-black tracking-wide text-wood/70 uppercase">{CATEGORY_LABELS[category]}</h3>
            <ul className="flex flex-col gap-2">
              {BUILDABLE_IDS.filter((id) => STRUCTURES[id].category === category).map((id) => (
                <StructureRow key={id} id={id} />
              ))}
            </ul>
          </section>
        ))}
        <section>
          <h3 className="mb-2 text-sm font-black tracking-wide text-wood/70 uppercase">Caminhos</h3>
          <RoadRow />
        </section>
        <p className="text-xs font-bold text-wood/80">
          Toda obra é feita pela equipe com 🔨 Obras nas atividades (Construção deixa mais rápido). O valor é pago na
          ordem e volta inteiro se você cancelar.
        </p>
        <Button variant={demolishing ? 'danger' : 'ghost'} onClick={() => setBuildMode(demolishing ? null : 'demolish')}>
          🧨 Demolir ou cancelar obra (demolição devolve {Math.round(DEMOLISH_REFUND * 100)}%)
        </Button>
      </div>
    </Panel>
  );
}

/** Reminder shown above the toolbar while in build mode. */
export function BuildBanner() {
  const mode = useGameStore((s) => s.buildMode);
  const setBuildMode = useGameStore((s) => s.setBuildMode);
  if (!mode) return null;
  const text =
    mode === 'demolish'
      ? '🧨 Demolir: clique numa construção ou estrada (numa obra na fila, cancela)'
      : mode === 'road'
        ? '🛤️ Estrada: clique e arraste para traçar'
        : `${STRUCTURES[mode].icon} Nova obra: ${STRUCTURES[mode].label.toLowerCase()} · clique para posicionar · R gira`;
  return (
    <Card className="flex items-center gap-3 px-4 py-2 text-sm font-extrabold">
      <span>{text}</span>
      <Button variant="ghost" className="text-xs" onClick={() => setBuildMode(null)}>
        Sair (Esc)
      </Button>
    </Card>
  );
}
