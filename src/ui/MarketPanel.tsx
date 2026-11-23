import { OFFERS } from '../data/docks';
import { TOWN_SHOPS } from '../data/market';
import { referencePrice } from '../game/listings';
import { ALL_GOODS, countIn, goodKey, unitWeight } from '../game/market';
import { knownGoods } from '../game/shipments';
import { toClock } from '../game/time';
import type { Order } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { formatCoins } from './format';
import { goodName } from './goods';
import { Button, Coins, Panel } from './primitives';

function OrderRow({ order }: { order: Order }) {
  const owned = useGameStore((s) => countIn(s.game.inventory, order.good));
  const day = useGameStore((s) => toClock(s.game.gameMinutes).day);
  const shop = TOWN_SHOPS[order.shop];
  const good = goodName(order.good);
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
        <span className={left <= 0 ? 'text-red-700' : 'text-wood/70'}>{left <= 0 ? 'último dia' : `${left} dia(s) de prazo`}</span>
        <span className="text-wood/70"> · você tem {owned}</span>
      </p>
    </li>
  );
}

/** Town market: what the town pays for each good, and the shops' orders. Selling goes through the dock. */
export function MarketPanel() {
  const close = useGameStore((s) => s.closePanel);
  const openDock = useGameStore((s) => s.openDock);
  const orders = useGameStore((s) => s.game.orders);
  const known = useGameStore((s) => knownGoods(s.game).map(goodKey).join(','));
  const shown = ALL_GOODS.filter((g) => known.split(',').includes(goodKey(g)));
  return (
    <Panel title="🏪 Mercado" onClose={close}>
      <div className="flex flex-col gap-3">
        <p className="rounded-xl bg-parchment-dark/60 p-3 text-xs font-bold text-wood/80">
          A cidade compra pela doca da fazenda: anuncie lá e feche as ofertas; o frete leva a mercadoria. Anúncios até{' '}
          {Math.round((OFFERS.ceiling - 1) * 100)}% acima destes preços ainda podem receber oferta.
        </p>
        <section>
          <h3 className="mb-1.5 font-black">Preços da cidade</h3>
          <ul className="grid grid-cols-2 gap-1.5">
            {shown.map((g) => {
              const name = goodName(g);
              return (
                <li key={goodKey(g)} className="flex items-center justify-between rounded-lg bg-parchment-dark/60 px-2 py-1 text-xs font-bold">
                  <span>
                    {name.icon} {name.label} <span className="text-wood/50">{unitWeight(g)} kg</span>
                  </span>
                  <Coins value={referencePrice(g)} />
                </li>
              );
            })}
          </ul>
        </section>
        <section>
          <h3 className="mb-1.5 font-black">Pedidos das lojas</h3>
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
        <Button variant="leaf" className="text-sm" onClick={() => openDock('sell')}>
          Abrir a doca para vender
        </Button>
      </div>
    </Panel>
  );
}
