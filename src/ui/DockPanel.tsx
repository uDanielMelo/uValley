import { WALK_IN } from '../data/docks';
import { bayCount, isDock } from '../game/dock';
import { countIn } from '../game/market';
import { hasGoods, loadingProgress } from '../game/shipments';
import { formatClock, toClock } from '../game/time';
import type { GameState, Shipment, ShipmentLine } from '../game/types';
import { useGameStore, type GameStore } from '../store/gameStore';
import { formatCoins } from './format';
import { goodName } from './MarketPanel';
import { Button, Coins } from './primitives';

const clock = (gameMinutes: number): string => formatClock(toClock(gameMinutes));

const selectedDock = (s: GameStore) => {
  const found = s.selectedStructure === null ? undefined : s.game.structures.find((x) => x.id === s.selectedStructure);
  return found && isDock(found) ? found : undefined;
};

/** The vehicles holding this dock's bays (the ones driving off are already gone for the farm). */
const atDock = (game: GameState, dockId: number): Shipment[] =>
  game.shipments.filter((s) => s.dockId === dockId && s.phase !== 'leaving');

/** One line of the order, with what the farm has in stock. */
function LineRow({ line, staged }: { line: ShipmentLine; staged: boolean }) {
  const owned = useGameStore((s) => countIn(s.game.inventory, line.good));
  const name = goodName(line.good);
  const short = !staged && owned < line.quantity;
  return (
    <li className="flex items-center justify-between gap-2 text-sm font-black">
      <span>
        {name.icon} {line.quantity} × {name.label.toLowerCase()}
      </span>
      {!staged && (
        <span className={`text-xs font-bold ${short ? 'text-red-700' : 'text-wood/70'}`}>
          {short ? `você tem ${owned}` : `em estoque: ${owned}`}
        </span>
      )}
    </li>
  );
}

function ShipmentCard({ id }: { id: number }) {
  const shipment = useGameStore((s) => s.game.shipments.find((x) => x.id === id));
  const enough = useGameStore((s) => {
    const found = s.game.shipments.find((x) => x.id === id);
    return found ? hasGoods(s.game, found.goods) : false;
  });
  const loaders = useGameStore((s) => s.game.workers.filter((w) => w.priorities.includes('haul')).length);
  const start = useGameStore((s) => s.startLoading);
  const cancel = useGameStore((s) => s.cancelLoading);
  const dismiss = useGameStore((s) => s.dismissShipment);
  if (!shipment) return null;
  const percent = Math.floor((loadingProgress(shipment) ?? 0) * 100);
  const loading = shipment.phase === 'loading';
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-parchment-dark/60 p-2.5">
      <p className="flex items-center justify-between text-xs font-extrabold">
        <span>🚗 Cliente</span>
        <span className="text-wood/70">
          {shipment.phase === 'enroute' ? `chega às ${clock(shipment.arrivesAt)}` : `vai embora às ${clock(shipment.deadline)}`}
        </span>
      </p>
      <ul className="flex flex-col gap-0.5">
        {shipment.goods.map((line) => (
          <LineRow key={`${line.good.kind}:${line.good.id}`} line={line} staged={loading} />
        ))}
      </ul>
      <p className="flex items-center justify-between text-xs font-bold">
        <span className="text-wood/70">Paga ao sair carregado</span>
        <Coins value={formatCoins(shipment.payment)} />
      </p>
      {loading && (
        <>
          <div className="flex justify-between text-xs font-extrabold">
            <span>📦 Carregando</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-wood/15">
            <div className="h-full bg-leaf" style={{ width: `${percent}%` }} />
          </div>
          {loaders === 0 && (
            <p className="text-xs font-bold text-red-700">Ninguém tem Carga nas atividades: ajuste na equipe (T).</p>
          )}
          <Button variant="ghost" className="self-start text-xs" onClick={() => cancel(id)}>
            Cancelar carga (a mercadoria volta)
          </Button>
        </>
      )}
      {shipment.phase === 'waiting' && (
        <div className="flex items-center gap-2">
          <Button variant="leaf" className="flex-1 text-sm" disabled={!enough} onClick={() => start(id)}>
            Mandar carregar
          </Button>
          <Button variant="ghost" className="text-xs" onClick={() => dismiss(id)}>
            Dispensar
          </Button>
        </div>
      )}
      {shipment.phase === 'waiting' && !enough && (
        <p className="text-xs font-bold text-wood/70">Falta mercadoria: colha ou dispense o cliente.</p>
      )}
    </div>
  );
}

/** The dock's bays: who is parked or on the way, what they want, and the loading. */
export function DockSection() {
  const dockId = useGameStore((s) => selectedDock(s)?.id ?? null);
  const bays = useGameStore((s) => {
    const dock = selectedDock(s);
    return dock ? bayCount(dock) : 0;
  });
  const ids = useGameStore((s) => (dockId === null ? '' : atDock(s.game, dockId).map((x) => x.id).join(',')));
  if (dockId === null) return null;
  const list = ids.split(',').filter(Boolean).map(Number);
  const hours = WALK_IN.hours.map((h) => `${h}h`).join(', ');
  return (
    <div className="flex flex-col gap-2">
      <p className="flex justify-between text-xs font-bold">
        <span className="text-wood/70">Vagas de carro</span>
        <span className="tabular-nums">
          {list.length}/{bays} ocupada{bays === 1 ? '' : 's'}
        </span>
      </p>
      {list.map((id) => (
        <ShipmentCard key={id} id={id} />
      ))}
      {list.length === 0 && (
        <p className="rounded-xl bg-parchment-dark/60 p-2.5 text-xs font-bold text-wood/80">
          Vaga livre. Clientes costumam passar perto das {hours}, cada um querendo um lote do que a fazenda produz.
        </p>
      )}
      <p className="text-[11px] font-bold text-wood/60">
        A equipe carrega pela atividade Carga (habilidade Construção). Se o prazo acabar no meio, ela descarrega e parte se perde.
      </p>
    </div>
  );
}
