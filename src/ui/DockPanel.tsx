import { useState } from 'react';
import { LISTINGS, OFFERS, WALK_IN } from '../data/docks';
import { TOWN_SHOPS, VEHICLES } from '../data/market';
import { bayCount, isDock } from '../game/dock';
import { offerChance, referencePrice } from '../game/listings';
import { giveUpRefund, heldFee, purchaseFreight } from '../game/purchases';
import { ALL_GOODS, countIn, goodKey, type Good } from '../game/market';
import { checkSale, freightCost, hasGoods, knownGoods, loadingProgress } from '../game/shipments';
import { formatClock, toClock } from '../game/time';
import type { GameState, HeldPurchase, Listing, Offer, Order, Shipment, ShipmentLine } from '../game/types';
import { ERROR_MESSAGES, deliveryText, useGameStore, type DockTab, type GameStore } from '../store/gameStore';
import { formatCoins } from './format';
import { goodName } from './goods';
import { Button, Coins, Panel } from './primitives';

const clock = (gameMinutes: number): string => formatClock(toClock(gameMinutes));

const selectedDock = (s: GameStore) => {
  const found = s.selectedStructure === null ? undefined : s.game.structures.find((x) => x.id === s.selectedStructure);
  return found && isDock(found) ? found : undefined;
};

/** The vehicles the farm is dealing with: hired, on the way or at the dock (not the ones driving off). */
const active = (game: GameState): Shipment[] => game.shipments.filter((s) => s.phase !== 'leaving');

/** How much buyers want a listing at this price, from the hourly offer chance. */
const interest = (ratio: number): { label: string; tone: string } => {
  const pull = offerChance(ratio) / OFFERS.hourlyChance;
  if (pull >= 1.5) return { label: 'Muita procura', tone: 'text-green-800' };
  if (pull >= 0.8) return { label: 'Boa procura', tone: 'text-green-800' };
  if (pull >= 0.25) return { label: 'Pouca procura', tone: 'text-amber-700' };
  if (pull > 0) return { label: 'Quase ninguém', tone: 'text-red-700' };
  return { label: 'Ninguém compra', tone: 'text-red-700' };
};

function Lot({ lines }: { lines: readonly ShipmentLine[] }) {
  return (
    <>
      {lines.map(({ good, quantity }) => {
        const name = goodName(good);
        return (
          <span key={goodKey(good)}>
            {name.icon} {quantity} × {name.label.toLowerCase()}
          </span>
        );
      })}
    </>
  );
}

function Progress({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-wood/15">
      <div className="h-full bg-leaf" style={{ width: `${percent}%` }} />
    </div>
  );
}

// ---------- the bay ----------

/** One line of a customer's order, with what the farm has in stock. */
function StockNote({ line }: { line: ShipmentLine }) {
  const owned = useGameStore((s) => countIn(s.game.inventory, line.good));
  const short = owned < line.quantity;
  return (
    <span className={`text-xs font-bold ${short ? 'text-red-700' : 'text-wood/70'}`}>
      {short ? `você tem ${owned}` : `em estoque: ${owned}`}
    </span>
  );
}

/** A delivery held in town: bring it with a new freight, or give it up. */
function HeldRow({ held }: { held: HeldPurchase }) {
  const level = useGameStore((s) => s.game.vehicleLevel);
  const money = useGameStore((s) => s.game.money);
  const reorder = useGameStore((s) => s.reorderHeld);
  const giveUp = useGameStore((s) => s.giveUpHeld);
  const freight = purchaseFreight(level, held.delivery);
  const fee = heldFee({ held: [held] });
  return (
    <li className="flex flex-col gap-1.5 rounded-xl bg-orange-100 p-2.5 text-xs font-bold text-orange-950">
      <p className="text-sm font-black">🏙️ {deliveryText(held.delivery)}</p>
      <p>
        Retido na cidade desde {clock(held.since)}
        {fee > 0 && (
          <>
            {' '}
            · <Coins value={formatCoins(fee)} /> por dia pelos animais
          </>
        )}
      </p>
      <div className="flex gap-2">
        <Button variant="leaf" className="flex-1 text-xs" disabled={money < freight} onClick={() => reorder(held.id)}>
          Novo frete <Coins value={formatCoins(freight)} />
        </Button>
        <Button variant="ghost" className="text-xs" onClick={() => giveUp(held.id)}>
          Desistir (+{formatCoins(giveUpRefund(held))})
        </Button>
      </div>
    </li>
  );
}

const STATUS: Record<Shipment['phase'], string> = {
  scheduled: '🕒 Frete agendado',
  enroute: '🛣️ A caminho',
  waiting: '🅿️ Na vaga',
  loading: '📦 Carregando',
  leaving: 'Saindo',
};

function ShipmentCard({ id }: { id: number }) {
  const shipment = useGameStore((s) => s.game.shipments.find((x) => x.id === id));
  const enough = useGameStore((s) => {
    const found = s.game.shipments.find((x) => x.id === id);
    return found ? found.kind !== 'walkin' || hasGoods(s.game, found.goods) : false;
  });
  const loaders = useGameStore((s) => s.game.workers.filter((w) => w.priorities.includes('haul')).length);
  const start = useGameStore((s) => s.startLoading);
  const cancel = useGameStore((s) => s.cancelLoading);
  const dismiss = useGameStore((s) => s.dismissShipment);
  if (!shipment) return null;
  const percent = Math.floor((loadingProgress(shipment) ?? 0) * 100);
  const sale = shipment.kind === 'sale';
  const purchase = shipment.kind === 'purchase';
  const shop = shipment.order ? TOWN_SHOPS[shipment.order.shop] : null;
  const who = purchase ? '📦 Entrega da cidade' : sale ? `🚚 Frete${shop ? ` · ${shop.icon} ${shop.label}` : ' · comprador'}` : '🚗 Cliente';
  const when =
    shipment.phase === 'scheduled'
      ? `sai a partir das ${clock(shipment.setOffAt)}`
      : shipment.phase === 'enroute'
        ? `chega às ${clock(shipment.arrivesAt)}`
        : `vai embora às ${clock(shipment.deadline)}`;
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-parchment-dark/60 p-2.5">
      <p className="flex items-center justify-between gap-2 text-xs font-extrabold">
        <span>{who}</span>
        <span className="text-wood/70">{purchase && shipment.phase === 'loading' ? '📦 Descarregando' : STATUS[shipment.phase]}</span>
      </p>
      {purchase && shipment.delivery ? (
        <p className="text-sm font-black">{deliveryText(shipment.delivery)}</p>
      ) : (
        <div className="flex items-center justify-between gap-2 text-sm font-black">
          <span className="flex flex-col">
            <Lot lines={shipment.goods} />
          </span>
          {!sale && shipment.phase !== 'loading' && shipment.goods[0] && <StockNote line={shipment.goods[0]} />}
          {sale && <span className="text-xs font-bold text-wood/70">separado</span>}
        </div>
      )}
      <p className="flex items-center justify-between text-xs font-bold">
        <span className="text-wood/70">{purchase ? 'Mercadoria paga' : sale ? 'Recebe ao sair carregado' : 'Paga ao sair carregado'}</span>
        <Coins value={formatCoins(purchase ? (shipment.goodsCost ?? 0) : shipment.payment)} />
      </p>
      {(sale || purchase) && (
        <p className="flex items-center justify-between text-xs font-bold text-wood/70">
          <span>Frete pago ({VEHICLES[shipment.vehicle ?? 1].label.toLowerCase()})</span>
          <Coins value={formatCoins(shipment.freight ?? 0)} />
        </p>
      )}
      <p className="text-xs font-bold text-wood/70">
        {when}
        {shipment.phase === 'scheduled' && ` · prazo até ${clock(shipment.deadline)}`}
      </p>
      {shipment.phase === 'loading' && (
        <>
          <div className="flex justify-between text-xs font-extrabold">
            <span>{purchase ? '📦 Descarregando' : '📦 Carregando'}</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <Progress percent={percent} />
          {loaders === 0 && (
            <p className="text-xs font-bold text-red-700">Ninguém tem Carga nas atividades: ajuste na equipe (T).</p>
          )}
          {shipment.kind === 'walkin' && (
            <Button variant="ghost" className="self-start text-xs" onClick={() => cancel(id)}>
              Cancelar carga (a mercadoria volta)
            </Button>
          )}
        </>
      )}
      {shipment.phase === 'waiting' && (
        <div className="flex items-center gap-2">
          <Button variant="leaf" className="flex-1 text-sm" disabled={!enough} onClick={() => start(id)}>
            {purchase ? 'Mandar descarregar' : 'Mandar carregar'}
          </Button>
          {shipment.kind === 'walkin' && (
            <Button variant="ghost" className="text-xs" onClick={() => dismiss(id)}>
              Dispensar
            </Button>
          )}
        </div>
      )}
      {shipment.phase === 'waiting' && !enough && shipment.kind === 'walkin' && (
        <p className="text-xs font-bold text-wood/70">Falta mercadoria: colha ou dispense o cliente.</p>
      )}
      {purchase && shipment.phase === 'scheduled' && (
        <button
          type="button"
          onClick={() => dismiss(id)}
          className="self-end text-[11px] font-extrabold text-red-800/80 hover:underline"
        >
          Cancelar compra (a mercadoria é devolvida, o frete não)
        </button>
      )}
      {sale && shipment.phase !== 'enroute' && (
        <button
          type="button"
          onClick={() => dismiss(id)}
          className="self-end text-[11px] font-extrabold text-red-800/80 hover:underline"
        >
          Cancelar venda (a mercadoria volta, o frete não)
        </button>
      )}
    </div>
  );
}

function HeldList() {
  const held = useGameStore((s) => s.game.held);
  if (held.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1.5 text-sm font-black">Retido na cidade</h3>
      <ul className="flex flex-col gap-2">
        {held.map((h) => (
          <HeldRow key={h.id} held={h} />
        ))}
      </ul>
    </section>
  );
}

/** Who is at the dock, on the way or hired. */
function BayList({ compact = false }: { compact?: boolean }) {
  const ids = useGameStore((s) => active(s.game).map((x) => x.id).join(','));
  const bays = useGameStore((s) => {
    const dock = s.game.structures.find(isDock);
    return dock ? bayCount(dock) : 0;
  });
  const parked = useGameStore((s) => active(s.game).filter((x) => x.phase !== 'scheduled' && x.phase !== 'enroute').length);
  const list = ids.split(',').filter(Boolean).map(Number);
  const hours = WALK_IN.hours.map((h) => `${h}h`).join(', ');
  return (
    <div className="flex flex-col gap-2">
      <p className="flex justify-between text-xs font-bold">
        <span className="text-wood/70">Vagas de carro</span>
        <span className="tabular-nums">
          {parked}/{bays} ocupada{bays === 1 ? '' : 's'}
        </span>
      </p>
      {list.map((id) => (
        <ShipmentCard key={id} id={id} />
      ))}
      {list.length === 0 && (
        <p className="rounded-xl bg-parchment-dark/60 p-2.5 text-xs font-bold text-wood/80">
          Vaga livre. Clientes avulsos costumam passar perto das {hours}; para vender mais, anuncie na aba Vender.
        </p>
      )}
      <HeldList />
      {!compact && (
        <p className="text-[11px] font-bold text-wood/60">
          A equipe carrega pela atividade Carga (habilidade Construção). Se o prazo acabar no meio, ela descarrega e parte se perde.
        </p>
      )}
    </div>
  );
}

// ---------- selling ----------

/** Why a lot cannot go by freight now (stock, room on the vehicle, money for the freight), or null. */
const useSaleBlock = (lines: ShipmentLine[]): string | null =>
  useGameStore((s) => {
    const error = checkSale(s.game, lines);
    return error ? ERROR_MESSAGES[error] : null;
  });

function OfferRow({ offer }: { offer: Offer }) {
  const listing = useGameStore((s) => s.game.listings.find((l) => l.id === offer.listingId));
  const level = useGameStore((s) => s.game.vehicleLevel);
  const accept = useGameStore((s) => s.acceptOffer);
  const decline = useGameStore((s) => s.declineOffer);
  const lines = listing ? [{ good: listing.good, quantity: offer.quantity }] : [];
  const block = useSaleBlock(lines);
  if (!listing) return null;
  const freight = freightCost(level, lines);
  const total = offer.price * offer.quantity;
  return (
    <li className="flex flex-col gap-1 rounded-xl bg-coin/20 p-2.5 text-xs font-bold ring-1 ring-coin/60">
      <div className="flex items-center justify-between gap-2 text-sm font-black">
        <span>
          📨 <Lot lines={lines} />
        </span>
        <Coins value={formatCoins(total)} />
      </div>
      <p className="text-wood/70">
        {offer.price} cada · frete <Coins value={formatCoins(freight)} /> · líquido {formatCoins(total - freight)} · vale até{' '}
        {clock(offer.expiresAt)}
      </p>
      {block && <p className="text-red-700">{block}</p>}
      <div className="flex gap-2">
        <Button variant="leaf" className="flex-1 text-xs" disabled={block !== null} onClick={() => accept(offer.id)}>
          Fechar e chamar frete
        </Button>
        <Button variant="ghost" className="text-xs" onClick={() => decline(offer.id)}>
          Recusar
        </Button>
      </div>
    </li>
  );
}

function ListingRow({ listing }: { listing: Listing }) {
  const reprice = useGameStore((s) => s.repriceListing);
  const remove = useGameStore((s) => s.removeListing);
  const owned = useGameStore((s) => countIn(s.game.inventory, listing.good));
  const name = goodName(listing.good);
  const reference = referencePrice(listing.good);
  const step = Math.max(1, Math.round(reference * 0.05));
  const level = interest(listing.price / reference);
  return (
    <li className="flex flex-col gap-1 rounded-xl bg-parchment-dark/60 p-2.5 text-xs font-bold">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-black">
          {name.icon} {listing.quantity} × {name.label.toLowerCase()}
        </span>
        <span className={level.tone}>{level.label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" className="px-2 py-0.5 text-xs" disabled={listing.price <= step} onClick={() => reprice(listing.id, listing.price - step)}>
          −
        </Button>
        <Coins value={`${listing.price} cada`} />
        <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => reprice(listing.id, listing.price + step)}>
          +
        </Button>
        <span className="flex-1 text-right text-wood/60">cidade paga ~{reference}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className={owned < listing.quantity ? 'text-amber-700' : 'text-wood/60'}>em estoque: {owned}</span>
        <button type="button" onClick={() => remove(listing.id)} className="text-[11px] font-extrabold text-red-800/80 hover:underline">
          Tirar anúncio
        </button>
      </div>
    </li>
  );
}

/** Form to put a good up for sale. */
function NewListing() {
  const known = useGameStore((s) => {
    const goods = new Map(knownGoods(s.game).map((g) => [goodKey(g), g]));
    for (const g of ALL_GOODS) if (countIn(s.game.inventory, g) > 0) goods.set(goodKey(g), g);
    return [...goods.keys()].join(',');
  });
  const options = ALL_GOODS.filter((g) => known.split(',').includes(goodKey(g)));
  const [key, setKey] = useState<string>('');
  const good: Good | undefined = options.find((g) => goodKey(g) === key) ?? options[0];
  const owned = useGameStore((s) => (good ? countIn(s.game.inventory, good) : 0));
  const full = useGameStore((s) => s.game.listings.length >= LISTINGS.max);
  const post = useGameStore((s) => s.postListing);
  const reference = good ? referencePrice(good) : 0;
  const [price, setPrice] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<number | null>(null);
  if (!good) return null;
  const shownPrice = price ?? reference;
  const shownQuantity = quantity ?? Math.max(1, owned);
  const level = interest(shownPrice / reference);
  const pickGood = (next: string) => {
    setKey(next);
    setPrice(null);
    setQuantity(null);
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-parchment-dark/60 p-2.5 text-xs font-bold">
      <label className="flex items-center justify-between gap-2">
        <span className="text-wood/70">Produto</span>
        <select
          className="rounded-lg bg-parchment px-2 py-1 font-black"
          value={goodKey(good)}
          onChange={(e) => pickGood(e.target.value)}
        >
          {options.map((g) => (
            <option key={goodKey(g)} value={goodKey(g)}>
              {goodName(g).icon} {goodName(g).label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2">
        <span className="text-wood/70">Quantidade (tem {owned})</span>
        <input
          type="number"
          min={1}
          max={LISTINGS.maxQuantity}
          className="w-20 rounded-lg bg-parchment px-2 py-1 text-right font-black tabular-nums"
          value={shownQuantity}
          onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
        />
      </label>
      <label className="flex items-center justify-between gap-2">
        <span className="text-wood/70">Preço por unidade (cidade ~{reference})</span>
        <input
          type="number"
          min={1}
          className="w-20 rounded-lg bg-parchment px-2 py-1 text-right font-black tabular-nums"
          value={shownPrice}
          onChange={(e) => setPrice(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
        />
      </label>
      <p className={`text-right ${level.tone}`}>{level.label}</p>
      <Button variant="leaf" className="text-sm" disabled={full} onClick={() => post(good, shownPrice, shownQuantity)}>
        {full ? `Máximo de ${LISTINGS.max} anúncios` : 'Anunciar'}
      </Button>
    </div>
  );
}

function SellTab() {
  const offers = useGameStore((s) => s.game.offers);
  const listings = useGameStore((s) => s.game.listings);
  return (
    <div className="flex flex-col gap-3">
      <section>
        <h3 className="mb-1.5 font-black">Ofertas</h3>
        {offers.length === 0 ? (
          <p className="text-xs font-bold text-wood/70">
            Nenhuma oferta agora. Elas chegam entre {OFFERS.hours[0]}h e {OFFERS.hours[1]}h; preço alto espanta compradores.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {offers.map((o) => (
              <OfferRow key={o.id} offer={o} />
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="mb-1.5 font-black">Seus anúncios</h3>
        {listings.length > 0 && (
          <ul className="mb-2 flex flex-col gap-2">
            {listings.map((l) => (
              <ListingRow key={l.id} listing={l} />
            ))}
          </ul>
        )}
        <NewListing />
      </section>
    </div>
  );
}

// ---------- town orders ----------

function OrderRow({ order }: { order: Order }) {
  const owned = useGameStore((s) => countIn(s.game.inventory, order.good));
  const day = useGameStore((s) => toClock(s.game.gameMinutes).day);
  const level = useGameStore((s) => s.game.vehicleLevel);
  const send = useGameStore((s) => s.sendOrder);
  const lines = [{ good: order.good, quantity: order.quantity }];
  const block = useSaleBlock(lines);
  const shop = TOWN_SHOPS[order.shop];
  const left = order.dueDay - day;
  const freight = freightCost(level, lines);
  return (
    <li className="flex flex-col gap-1 rounded-xl bg-parchment-dark/60 p-2.5 text-xs font-bold">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-black">
          {shop.icon} {shop.label}
        </span>
        <Coins value={formatCoins(order.reward)} />
      </div>
      <p>
        <Lot lines={lines} /> ·{' '}
        <span className={left <= 0 ? 'text-red-700' : 'text-wood/70'}>{left <= 0 ? 'último dia' : `${left} dia(s) de prazo`}</span>
      </p>
      <p className="text-wood/70">
        Você tem {owned} · frete <Coins value={formatCoins(freight)} />
      </p>
      {block && owned >= order.quantity && <p className="text-red-700">{block}</p>}
      <Button className="text-xs" disabled={block !== null} onClick={() => send(order.id)}>
        Enviar por frete
      </Button>
    </li>
  );
}

function OrdersTab() {
  const orders = useGameStore((s) => s.game.orders);
  if (orders.length === 0) {
    return <p className="text-xs font-bold text-wood/70">Nenhum pedido das lojas agora. Novos aparecem à meia-noite.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {orders.map((o) => (
        <OrderRow key={o.id} order={o} />
      ))}
    </ul>
  );
}

// ---------- panel and card ----------

const TABS: ReadonlyArray<readonly [DockTab, string]> = [
  ['bay', 'Na vaga'],
  ['sell', 'Vender'],
  ['orders', 'Pedidos'],
];

/** The dock: who is at the bay, the listings and offers, and the town's orders. */
export function DockPanel() {
  const tab = useGameStore((s) => s.dockTab);
  const setTab = useGameStore((s) => s.setDockTab);
  const close = useGameStore((s) => s.closePanel);
  const offers = useGameStore((s) => s.game.offers.length);
  const orders = useGameStore((s) => s.game.orders.length);
  const held = useGameStore((s) => s.game.held.length);
  const counts: Record<DockTab, number> = { bay: held, sell: offers, orders };
  return (
    <Panel title="🚚 Doca" onClose={close} width="w-[24rem]">
      <div className="mb-3 flex gap-1.5">
        {TABS.map(([id, label]) => (
          <Button key={id} variant={tab === id ? 'wood' : 'ghost'} className="flex-1 text-sm" onClick={() => setTab(id)}>
            {label}
            {counts[id] > 0 && <span className="ml-1 rounded-full bg-coin px-1.5 text-[10px] text-wood-dark">{counts[id]}</span>}
          </Button>
        ))}
      </div>
      {tab === 'bay' && <BayList />}
      {tab === 'sell' && <SellTab />}
      {tab === 'orders' && <OrdersTab />}
    </Panel>
  );
}

/** The dock's card: the bay at a glance, and the way to sell. */
export function DockSection() {
  const dockId = useGameStore((s) => selectedDock(s)?.id ?? null);
  const openDock = useGameStore((s) => s.openDock);
  if (dockId === null) return null;
  return (
    <div className="flex flex-col gap-2">
      <BayList compact />
      <div className="flex gap-2">
        <Button variant="leaf" className="flex-1 text-xs" onClick={() => openDock('sell')}>
          Vender por anúncio
        </Button>
        <Button className="flex-1 text-xs" onClick={() => openDock('orders')}>
          Pedidos da cidade
        </Button>
      </div>
    </div>
  );
}
