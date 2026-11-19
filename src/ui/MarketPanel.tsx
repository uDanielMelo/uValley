import { ANIMAL_PRODUCTS } from '../data/animals';
import { CROPS } from '../data/crops';
import { MARKET_BONUS, TOWN_SHOPS, VEHICLES } from '../data/market';
import {
  ALL_GOODS,
  cargoWeight,
  countIn,
  goodKey,
  marketPrice,
  nextPickup,
  unitWeight,
  vehicleCapacity,
  type Good,
} from '../game/market';
import { formatClock, toClock } from '../game/time';
import type { Order } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { formatCoins } from './format';
import { Button, Coins, Panel } from './primitives';

export const goodName = (good: Good): { label: string; icon: string } =>
  good.kind === 'crop' ? CROPS[good.id] : ANIMAL_PRODUCTS[good.id];

/** Weight on the vehicle against its capacity, and when it leaves. */
function LoadBar() {
  const level = useGameStore((s) => s.game.vehicleLevel);
  const weight = useGameStore((s) => cargoWeight(s.game.cargo));
  const capacity = useGameStore((s) => vehicleCapacity(s.game));
  const pickup = useGameStore((s) => formatClock(toClock(nextPickup(s.game.gameMinutes))));
  const vehicle = VEHICLES[level];
  const share = Math.min(100, (weight / capacity) * 100);
  return (
    <div className="rounded-xl bg-parchment-dark/60 p-3 text-xs font-bold">
      <div className="flex justify-between">
        <span>
          {vehicle.icon} {vehicle.label}
        </span>
        <span className="tabular-nums">
          {weight}/{capacity} kg
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-wood/20">
        <div className="h-full bg-leaf" style={{ width: `${share}%` }} />
      </div>
      <p className="mt-1 text-wood/80">
        Passa na fazenda às {pickup} e leva a carga: pedidos primeiro, o resto no mercado ({Math.round((MARKET_BONUS - 1) * 100)}% a
        mais que a caixa de venda).
      </p>
    </div>
  );
}

function OrderRow({ order }: { order: Order }) {
  const loaded = useGameStore((s) => countIn(s.game.cargo, order.good));
  const owned = useGameStore((s) => countIn(s.game.inventory, order.good));
  const day = useGameStore((s) => toClock(s.game.gameMinutes).day);
  const load = useGameStore((s) => s.loadCargo);
  const shop = TOWN_SHOPS[order.shop];
  const good = goodName(order.good);
  const ready = loaded >= order.quantity;
  const missing = Math.max(0, order.quantity - loaded);
  const left = order.dueDay - day;
  return (
    <li className="rounded-xl bg-parchment-dark/60 p-2.5 text-xs font-bold">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-black">
          {shop.icon} {shop.label}
        </span>
        <Coins value={formatCoins(order.reward)} />
      </div>
      <p className="mt-0.5">
        {order.quantity} {good.icon} {good.label.toLowerCase()} ·{' '}
        <span className={left <= 0 ? 'text-red-700' : 'text-wood/70'}>
          {left <= 0 ? 'último dia' : `${left} dia(s) de prazo`}
        </span>
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className={ready ? 'text-leaf' : 'text-wood/70'}>
          {ready ? '✓ Na carga' : `Na carga: ${loaded}/${order.quantity} · você tem ${owned}`}
        </span>
        {!ready && (
          <Button className="text-xs" disabled={owned === 0} onClick={() => load(order.good, missing)}>
            Carregar
          </Button>
        )}
      </div>
    </li>
  );
}

function GoodRow({ good }: { good: Good }) {
  const owned = useGameStore((s) => countIn(s.game.inventory, good));
  const loaded = useGameStore((s) => countIn(s.game.cargo, good));
  const load = useGameStore((s) => s.loadCargo);
  const unload = useGameStore((s) => s.unloadCargo);
  const name = goodName(good);
  return (
    <li className="flex items-center gap-2 rounded-xl bg-parchment-dark/60 p-2 text-xs font-bold">
      <div className="flex-1">
        <p className="text-sm font-black">
          {name.icon} {name.label}
        </p>
        <p className="text-wood/70">
          Tem {owned} · na carga {loaded} · {unitWeight(good)} kg · <Coins value={marketPrice(good)} />
        </p>
      </div>
      <Button variant="ghost" className="text-xs" disabled={loaded === 0} onClick={() => unload(good, loaded)}>
        Tirar
      </Button>
      <Button className="text-xs" disabled={owned === 0} onClick={() => load(good, 1)}>
        +1
      </Button>
      <Button className="text-xs" disabled={owned === 0} onClick={() => load(good, owned)}>
        Tudo
      </Button>
    </li>
  );
}

/** Town market: load goods on the vehicle and see the shops' orders. */
export function MarketPanel() {
  const close = useGameStore((s) => s.closePanel);
  const orders = useGameStore((s) => s.game.orders);
  const goods = useGameStore((s) =>
    ALL_GOODS.filter((g) => countIn(s.game.inventory, g) > 0 || countIn(s.game.cargo, g) > 0)
      .map(goodKey)
      .join(','),
  );
  const shown = ALL_GOODS.filter((g) => goods.split(',').includes(goodKey(g)));
  return (
    <Panel title="🏪 Mercado" onClose={close}>
      <div className="flex flex-col gap-3">
        <LoadBar />
        <section>
          <h3 className="mb-1.5 font-black">Pedidos da cidade</h3>
          {orders.length === 0 ? (
            <p className="text-xs font-bold text-wood/70">Nenhum pedido agora. Novos aparecem à meia-noite.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {orders.map((o) => (
                <OrderRow key={o.id} order={o} />
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-1.5 font-black">Carregar</h3>
          {shown.length === 0 ? (
            <p className="text-xs font-bold text-wood/70">Nada para vender. Colha ou recolha produtos dos animais.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {shown.map((g) => (
                <GoodRow key={goodKey(g)} good={g} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Panel>
  );
}
