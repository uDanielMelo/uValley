import { useState, type ReactNode } from 'react';
import {
  ANIMALS,
  ANIMAL_IDS,
  ANIMAL_PRODUCTS,
  BREEDS,
  FEED,
  PLOT_PASTURE_UNITS,
  SPECIES_BREEDS,
  type AnimalId,
  type BreedId,
} from '../data/animals';
import { FERTILIZER } from '../data/fertilizer';
import { MEDICINES, MEDICINE_IDS, type MedicineId } from '../data/health';
import { STRUCTURES } from '../data/structures';
import { CROPS, CROP_IDS, CROP_SEASON_BONUS, type CropId } from '../data/crops';
import { SEASONS } from '../data/climate';
import { isUnlocked, researchProgress } from '../game/research';
import { PLOT_SIZE } from '../data/world';
import { dailyFeedKg, purchasePrice, type PurchaseAge } from '../game/animals';
import { keptPasture, openSeats, pendingFeed } from '../game/delivery';
import { freeMedicine } from '../game/health';
import { cartAdd, cartGoodsCost, cartIsEmpty, checkPurchase, purchaseFreight } from '../game/purchases';
import { housesKind, pastureCapacity, pastureUsed, sheltersFor } from '../game/shelters';
import { isActive } from '../game/structures';
import { nextPlotCost } from '../game/economy';
import { ERROR_MESSAGES, deliveryText, useGameStore, type GameStore } from '../store/gameStore';
import { formatCoins, formatHours } from './format';
import { Button, Coins, Panel } from './primitives';

const QUANTITIES = [1, 5, 10] as const;

const KIND_NOTES: Record<'field' | 'greenhouse' | 'orchard', string> = {
  field: 'Lavoura: precisa ser regada',
  greenhouse: 'Só na estufa (rega sozinha)',
  orchard: 'Pomar: árvore que não precisa de rega e dá frutos de novo',
};

/** A crop still to be researched: price and time, or the research under way. */
function ResearchRow({ id }: { id: CropId }) {
  const def = CROPS[id];
  const research = def.research;
  const money = useGameStore((s) => s.game.money);
  const current = useGameStore((s) => s.game.research.current?.cropId ?? null);
  const progress = useGameStore((s) => Math.floor((researchProgress(s.game) ?? 0) * 100));
  const start = useGameStore((s) => s.startResearch);
  if (!research) return null;
  const mine = current === id;
  return (
    <li className="rounded-xl border-2 border-dashed border-wood/25 p-3">
      <div className="flex items-center justify-between">
        <span className="text-base font-black text-wood/80">
          {def.icon} {def.label} <span className="text-xs">🔒</span>
        </span>
        <span className="flex items-center gap-1 text-xs font-bold">
          Vende por <Coins value={def.sellPrice} />
        </span>
      </div>
      <p className="mt-0.5 text-xs font-bold text-wood/70">{KIND_NOTES[def.kind]}.</p>
      {mine ? (
        <div className="mt-2 text-xs font-bold">
          🔬 Pesquisando: {progress}%
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-wood/20">
            <div className="h-full bg-leaf" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <Button
          className="mt-2 w-full text-sm"
          disabled={money < research.cost || current !== null}
          onClick={() => start(id)}
          title={current !== null ? 'Uma pesquisa por vez' : undefined}
        >
          🔬 Pesquisar ({research.hours} h) <Coins value={formatCoins(research.cost)} />
        </Button>
      )}
    </li>
  );
}

/** A known crop's seeds; locked crops show their research instead. */
function CropRow({ id }: { id: CropId }) {
  const known = useGameStore((s) => isUnlocked(s.game, id));
  return known ? <SeedRow id={id} /> : <ResearchRow id={id} />;
}

/** Buttons that put 1, 5 or 10 of something in the cart, with what is already there. */
function AddButtons({ price, inCart, add }: { price: number; inCart: number; add: (n: number) => void }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      {QUANTITIES.map((q) => (
        <Button key={q} className="flex-1 px-2 text-xs whitespace-nowrap" onClick={() => add(q)}>
          +{q} <Coins value={formatCoins(price * q)} />
        </Button>
      ))}
      {inCart > 0 && (
        <Button variant="ghost" className="text-xs" title="Tirar do carrinho" onClick={() => add(-inCart)}>
          🛒 {inCart} ×
        </Button>
      )}
    </div>
  );
}

function SeedRow({ id }: { id: CropId }) {
  const def = CROPS[id];
  const owned = useGameStore((s) => s.game.inventory.seeds[id] ?? 0);
  const inCart = useGameStore((s) => s.cart.seeds[id] ?? 0);
  const update = useGameStore((s) => s.updateCart);
  return (
    <li className="rounded-xl bg-parchment-dark/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-base font-black">
          {def.icon} Semente de {def.label.toLowerCase()}
        </span>
        <span className="text-xs font-bold">Você tem {owned}</span>
      </div>
      <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs font-bold text-wood/80">
        <span>
          {def.kind === 'orchard' ? 'Primeira colheita' : 'Cresce'} em {formatHours(def.growthHours)}
          {def.kind === 'field' ? ' regado' : ''}
          {def.regrowHours ? `, depois a cada ${formatHours(def.regrowHours)}` : ''}
        </span>
        {def.season && (
          <span>
            {SEASONS[def.season].icon} +{Math.round((CROP_SEASON_BONUS - 1) * 100)}% no {SEASONS[def.season].label.toLowerCase()}
          </span>
        )}
        {def.kind !== 'field' && <span>{KIND_NOTES[def.kind]}</span>}
        <span className="flex items-center gap-1">
          Vende por <Coins value={def.sellPrice} />
        </span>
      </p>
      <AddButtons price={def.seedCost} inCart={inCart} add={(n) => update((c) => ({ ...c, seeds: cartAdd(c.seeds, id, n) }))} />
    </li>
  );
}

/** What an animal is good for, in one line. */
const animalPurpose = (kind: AnimalId): string => {
  const def = ANIMALS[kind];
  if (def.product) {
    const product = ANIMAL_PRODUCTS[def.product];
    return `Dá ${product.icon} ${product.label.toLowerCase()} a cada ${formatHours(def.productionHours)}`;
  }
  if (def.labor.hoe) return `Ajuda a arar: +${Math.round(def.labor.hoe * 100)}% de velocidade`;
  if (def.labor.walk) return `Leva a equipe: +${Math.round(def.labor.walk * 100)}% na caminhada`;
  return '';
};

/**
 * Room for more animals of a kind: open seats in working shelters (finished, reached by road), minus
 * the ones kept for animals on their way and the ones in the cart; null without any shelter.
 */
const shelterRoom = (kind: AnimalId) => (s: GameStore): number | null => {
  const homes = s.game.structures.filter((x) => housesKind(x.type, kind) && isActive(s.game, x));
  if (homes.length === 0) return null;
  const inCart = s.cart.animals.filter((a) => homes.some((h) => housesKind(h.type, a.kind))).length;
  return Math.max(0, homes.reduce((sum, x) => sum + Math.max(0, openSeats(s.game, x)), 0) - inCart);
};

function Choice({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`rounded-lg px-2 py-0.5 text-xs font-extrabold ${active ? 'bg-wood text-parchment' : 'bg-parchment hover:bg-parchment-dark'}`}
    >
      {children}
    </button>
  );
}

function AnimalRow({ kind }: { kind: AnimalId }) {
  const def = ANIMALS[kind];
  const owned = useGameStore((s) => s.game.animals.filter((a) => a.kind === kind).length);
  const coming = useGameStore((s) => s.cart.animals.filter((a) => a.kind === kind).length);
  const room = useGameStore(shelterRoom(kind));
  const pastureLeft = useGameStore(
    (s) =>
      pastureCapacity(s.game) -
      pastureUsed(s.game) -
      keptPasture(s.game) -
      s.cart.animals.reduce((sum, a) => sum + ANIMALS[a.kind].pastureUnits, 0),
  );
  const shelterName = STRUCTURES[sheltersFor(kind)[0] ?? 'chickenCoop'].label;
  const blocked = room === null || room === 0 || pastureLeft < def.pastureUnits;
  const update = useGameStore((s) => s.updateCart);
  const breeds = SPECIES_BREEDS[kind];
  const [breed, setBreed] = useState<BreedId>(breeds[0] ?? 'caipira');
  const [age, setAge] = useState<PurchaseAge>('adult');
  const price = purchasePrice(kind, breed, age);
  const productId = BREEDS[breed].product ?? def.product;
  const product = productId ? ANIMAL_PRODUCTS[productId] : null;
  return (
    <li className="rounded-xl bg-parchment-dark/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-base font-black">
          {def.icon} {def.label}
        </span>
        <span className="text-xs font-bold">
          Você tem {owned}
          {coming > 0 && ` · 🛒 ${coming}`}
        </span>
      </div>
      <p className="mt-0.5 text-xs font-bold text-wood/80">{animalPurpose(kind)}</p>
      <p className="flex flex-wrap gap-x-3 text-xs font-bold text-wood/80">
        <span className="flex items-center gap-1">
          {FEED.icon} {def.feedKgPerDay} kg de ração/dia
        </span>
        {product && (
          <span className="flex items-center gap-1">
            {product.label} vale <Coins value={product.sellPrice} />
          </span>
        )}
        <span>
          Pasto: {def.pastureUnits} {def.pastureUnits === 1 ? 'unidade' : 'unidades'}
        </span>
      </p>
      <p className={`text-xs font-bold ${blocked ? 'text-red-700' : 'text-wood/80'}`}>
        {room === null
          ? `Precisa de um ${shelterName.toLowerCase()} pronto.`
          : room === 0
            ? `${shelterName}: sem vaga. Construa outro.`
            : pastureLeft < def.pastureUnits
              ? 'Pasto lotado: compre um lote ou libere grama.'
              : `${shelterName}: ${room} ${room === 1 ? 'vaga' : 'vagas'}.`}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {breeds.map((id) => (
          <Choice key={id} active={breed === id} onClick={() => setBreed(id)} title={BREEDS[id].note}>
            {BREEDS[id].noble ? '★ ' : ''}
            {BREEDS[id].label}
          </Choice>
        ))}
        <span className="mx-1 w-px bg-wood/20" aria-hidden />
        <Choice active={age === 'baby'} onClick={() => setAge('baby')} title="Mais barato; só produz depois de crescer">
          Filhote
        </Choice>
        <Choice active={age === 'adult'} onClick={() => setAge('adult')} title="Já produz">
          Adulto
        </Choice>
      </div>
      <p className="mt-1 text-[11px] font-bold text-wood/70">{BREEDS[breed].note}</p>
      <div className="mt-2 flex gap-2">
        <Button
          className="flex-1 text-sm"
          disabled={blocked}
          onClick={() => update((c) => ({ ...c, animals: [...c.animals, { kind, breed, age }] }))}
        >
          Pôr no carrinho <Coins value={formatCoins(price)} />
        </Button>
        {coming > 0 && (
          <Button
            variant="ghost"
            className="text-xs"
            title="Tirar um do carrinho"
            onClick={() =>
              update((c) => {
                const i = c.animals.map((a) => a.kind).lastIndexOf(kind);
                return i < 0 ? c : { ...c, animals: c.animals.filter((_, j) => j !== i) };
              })
            }
          >
            −1
          </Button>
        )}
      </div>
    </li>
  );
}

function PastureSummary() {
  const used = useGameStore((s) => pastureUsed(s.game));
  const capacity = useGameStore((s) => pastureCapacity(s.game));
  const share = capacity > 0 ? Math.min(100, (used / capacity) * 100) : 100;
  return (
    <div className="rounded-xl bg-parchment-dark/60 p-3 text-xs font-bold">
      <div className="flex justify-between">
        <span>🌿 Pasto</span>
        <span className={`tabular-nums ${used > capacity ? 'text-red-700' : ''}`}>
          {used}/{capacity} unidades
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-wood/20">
        <div className={`h-full ${used > capacity ? 'bg-red-700' : 'bg-leaf'}`} style={{ width: `${share}%` }} />
      </div>
      <p className="mt-1 text-wood/80">
        Cada lote de grama livre comporta {PLOT_PASTURE_UNITS} unidades. Acima disso a produção cai.
      </p>
    </div>
  );
}

/** The feed stock, what the animals eat, and the automatic order. */
function FeedRow() {
  const stock = useGameStore((s) => s.game.inventory.feed);
  const coming = useGameStore((s) => pendingFeed(s.game));
  const daily = useGameStore((s) => dailyFeedKg(s.game));
  const auto = useGameStore((s) => s.game.feedOrder.auto);
  const days = useGameStore((s) => s.game.feedOrder.days);
  const inCart = useGameStore((s) => s.cart.feed);
  const setOrder = useGameStore((s) => s.setFeedOrder);
  const update = useGameStore((s) => s.updateCart);
  const left = daily > 0 ? Math.floor(stock / daily) : null;
  return (
    <li className="rounded-xl bg-parchment-dark/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-base font-black">
          {FEED.icon} {FEED.label}
        </span>
        <span className="text-xs font-bold">
          {stock} kg{coming > 0 ? ` (+${coming} a caminho)` : ''}
        </span>
      </div>
      <p className={`mt-0.5 text-xs font-bold ${left !== null && left < 1 ? 'text-red-700' : 'text-wood/80'}`}>
        Os animais comem {daily} kg à meia-noite{left !== null ? `: dá para ${left} dia(s)` : ''}. Sem ração, não produzem.
      </p>
      <div className="mt-1.5 flex items-center gap-2 text-xs font-bold">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={auto} onChange={(e) => setOrder(e.target.checked, days)} />
          Pedir sozinho, para
        </label>
        <Button variant="ghost" className="px-2 py-0 text-xs" disabled={days <= 1} onClick={() => setOrder(auto, days - 1)}>
          −
        </Button>
        <span className="tabular-nums">{days} dia(s)</span>
        <Button variant="ghost" className="px-2 py-0 text-xs" disabled={days >= 14} onClick={() => setOrder(auto, days + 1)}>
          +
        </Button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {[20, 50, 100].map((kg) => (
          <Button key={kg} className="flex-1 px-2 text-xs whitespace-nowrap" onClick={() => update((c) => ({ ...c, feed: c.feed + kg }))}>
            +{kg} kg <Coins value={formatCoins(kg * FEED.pricePerKg)} />
          </Button>
        ))}
        {inCart > 0 && (
          <Button variant="ghost" className="text-xs" title="Tirar do carrinho" onClick={() => update((c) => ({ ...c, feed: 0 }))}>
            🛒 {inCart} ×
          </Button>
        )}
      </div>
    </li>
  );
}

function AnimalsTab() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold text-wood/80">
        Cada animal mora num abrigo da sua espécie, pasta por perto e dorme lá dentro. Os produtos ficam no abrigo
        até a equipe com 🪣 Tratar animais coletar. Os animais vêm num caminhão boiadeiro contratado e a vaga no
        abrigo fica reservada desde o pedido. Vivem cerca de 4 dias reais (filhote, jovem, adulto e idoso); para
        vender, clique no animal com a mão.
      </p>
      <ul>
        <FeedRow />
      </ul>
      <PastureSummary />
      <ul className="flex flex-col gap-2">
        {ANIMAL_IDS.map((kind) => (
          <AnimalRow key={kind} kind={kind} />
        ))}
      </ul>
    </div>
  );
}

function FertilizerRow() {
  const owned = useGameStore((s) => s.game.inventory.fertilizer);
  const inCart = useGameStore((s) => s.cart.fertilizer);
  const update = useGameStore((s) => s.updateCart);
  return (
    <li className="rounded-xl bg-parchment-dark/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-base font-black">
          {FERTILIZER.icon} {FERTILIZER.label}
        </span>
        <span className="text-xs font-bold">Você tem {owned}</span>
      </div>
      <p className="mt-0.5 text-xs font-bold text-wood/80">
        Cresce {Math.round((FERTILIZER.growth - 1) * 100)}% mais rápido e {Math.round(FERTILIZER.harvestBonus * 100)}% de chance
        de colher uma a mais. Os abrigos também dão esterco de graça.
      </p>
      <AddButtons price={FERTILIZER.price} inCart={inCart} add={(n) => update((c) => ({ ...c, fertilizer: Math.max(0, c.fertilizer + n) }))} />
    </li>
  );
}

function MedicineRow({ id }: { id: MedicineId }) {
  const def = MEDICINES[id];
  const owned = useGameStore((s) => s.game.inventory.medicine[id] ?? 0);
  const free = useGameStore((s) => freeMedicine(s.game, id));
  const inCart = useGameStore((s) => s.cart.medicine[id] ?? 0);
  const update = useGameStore((s) => s.updateCart);
  return (
    <li className="rounded-xl bg-parchment-dark/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-base font-black">
          {def.icon} {def.label}
        </span>
        <span className="text-xs font-bold">
          Você tem {owned}
          {owned > free ? ` (${owned - free} reservado${owned - free === 1 ? '' : 's'})` : ''}
        </span>
      </div>
      <p className="mt-0.5 text-xs font-bold text-wood/80">{def.note} Uma dose por animal.</p>
      <AddButtons price={def.price} inCart={inCart} add={(n) => update((c) => ({ ...c, medicine: cartAdd(c.medicine, id, n) }))} />
    </li>
  );
}

function MedicineTab() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold text-wood/80">
        Quando a fazenda percebe um animal doente ou ferido e há remédio no estoque, a equipe com 🪣 Tratar animais vai
        medicar sozinha. Quem tem a habilidade Animais percebe a doença mais cedo. Abrigos melhores adoecem menos e
        protegem dos predadores à noite.
      </p>
      <ul className="flex flex-col gap-2">
        {MEDICINE_IDS.map((id) => (
          <MedicineRow key={id} id={id} />
        ))}
      </ul>
    </div>
  );
}

function LandTab() {
  const cost = useGameStore((s) => nextPlotCost(s.game));
  const money = useGameStore((s) => s.game.money);
  const owned = useGameStore((s) => s.game.unlockedPlots.length);
  return (
    <div className="flex flex-col gap-3 text-sm font-bold">
      <p>
        A fazenda cresce em lotes de {PLOT_SIZE}×{PLOT_SIZE}. Você possui <b>{owned}</b> lotes.
      </p>
      <div className="flex items-center justify-between rounded-xl bg-parchment-dark/60 p-3 text-base">
        <span className="font-black">Próximo lote</span>
        <Coins value={formatCoins(cost)} className={money < cost ? 'text-red-700' : ''} />
      </div>
      <p className="text-wood/80">
        Clique em um lote escurecido vizinho à sua cerca para comprá-lo. Cada lote comprado deixa o próximo mais caro.
      </p>
    </div>
  );
}

/** The cart: what is in it, goods + freight, and the order. Everything comes by freight to the dock. */
function CartBar() {
  const cart = useGameStore((s) => s.cart);
  const level = useGameStore((s) => s.game.vehicleLevel);
  const error = useGameStore((s) => checkPurchase(s.game, s.cart));
  const order = useGameStore((s) => s.orderCart);
  const clear = useGameStore((s) => s.clearCart);
  if (cartIsEmpty(cart)) {
    return (
      <p className="mb-3 rounded-xl bg-parchment-dark/60 p-2.5 text-xs font-bold text-wood/80">
        🛒 Ponha no carrinho e peça a entrega: o frete traz tudo de uma vez até a doca e a equipe descarrega.
      </p>
    );
  }
  const goods = cartGoodsCost(cart);
  const freight = purchaseFreight(level, cart);
  const lot = deliveryText({ ...cart, animals: cart.animals.map((a) => ({ ...a, stars: 1, shelterId: 0, price: 0 })) });
  return (
    <div className="mb-3 flex flex-col gap-1.5 rounded-xl bg-coin/20 p-2.5 text-xs font-bold ring-1 ring-coin/60">
      <p className="font-black">🛒 {lot}</p>
      <p className="flex flex-wrap items-center gap-x-2 text-wood/80">
        Mercadoria <Coins value={formatCoins(goods)} /> + frete <Coins value={formatCoins(freight)} /> ={' '}
        <Coins value={formatCoins(goods + freight)} />
      </p>
      {error && error !== 'empty-cart' && <p className="text-red-700">{ERROR_MESSAGES[error]}</p>}
      <div className="flex gap-2">
        <Button variant="leaf" className="flex-1 text-sm" disabled={error !== null} onClick={order}>
          Pedir entrega
        </Button>
        <Button variant="ghost" className="text-xs" onClick={clear}>
          Esvaziar
        </Button>
      </div>
    </div>
  );
}

export function ShopPanel() {
  const tab = useGameStore((s) => s.shopTab);
  const setTab = useGameStore((s) => s.setShopTab);
  const close = useGameStore((s) => s.closePanel);
  return (
    <Panel title="🛒 Loja" onClose={close}>
      {tab !== 'land' && <CartBar />}
      <div className="mb-3 flex gap-1.5">
        <Button variant={tab === 'seeds' ? 'wood' : 'ghost'} className="flex-1 px-1.5 text-sm" onClick={() => setTab('seeds')}>
          Sementes
        </Button>
        <Button variant={tab === 'animals' ? 'wood' : 'ghost'} className="flex-1 px-1.5 text-sm" onClick={() => setTab('animals')}>
          Animais
        </Button>
        <Button variant={tab === 'medicine' ? 'wood' : 'ghost'} className="flex-1 px-1.5 text-sm" onClick={() => setTab('medicine')}>
          Remédios
        </Button>
        <Button variant={tab === 'land' ? 'wood' : 'ghost'} className="flex-1 px-1.5 text-sm" onClick={() => setTab('land')}>
          Terrenos
        </Button>
      </div>
      {tab === 'seeds' && (
        <ul className="flex flex-col gap-2">
          {CROP_IDS.map((id) => (
            <CropRow key={id} id={id} />
          ))}
          <FertilizerRow />
        </ul>
      )}
      {tab === 'animals' && <AnimalsTab />}
      {tab === 'medicine' && <MedicineTab />}
      {tab === 'land' && <LandTab />}
    </Panel>
  );
}
