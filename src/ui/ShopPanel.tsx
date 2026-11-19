import { useState, type ReactNode } from 'react';
import {
  ANIMALS,
  ANIMAL_IDS,
  ANIMAL_PRODUCTS,
  BREEDS,
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
import { purchasePrice, type PurchaseAge } from '../game/animals';
import { freeMedicine } from '../game/health';
import { freeSlots, housesKind, pastureCapacity, pastureUsed, sheltersFor } from '../game/shelters';
import { isOperational } from '../game/structures';
import { nextPlotCost } from '../game/economy';
import { useGameStore, type GameStore } from '../store/gameStore';
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

function SeedRow({ id }: { id: CropId }) {
  const def = CROPS[id];
  const money = useGameStore((s) => s.game.money);
  const owned = useGameStore((s) => s.game.inventory.seeds[id] ?? 0);
  const buy = useGameStore((s) => s.buySeeds);
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
      <div className="mt-2 flex gap-2">
        {QUANTITIES.map((q) => {
          const cost = def.seedCost * q;
          return (
            <Button key={q} className="flex-1 text-sm" disabled={money < cost} onClick={() => buy(id, q)}>
              {q}× <Coins value={formatCoins(cost)} />
            </Button>
          );
        })}
      </div>
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

/** Room for one more animal of a kind: free slots in finished shelters, or null without any. */
const shelterRoom = (kind: AnimalId) => (s: GameStore): number | null => {
  const homes = s.game.structures.filter((x) => housesKind(x.type, kind) && isOperational(x));
  return homes.length === 0 ? null : homes.reduce((sum, x) => sum + Math.max(0, freeSlots(s.game, x)), 0);
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
  const money = useGameStore((s) => s.game.money);
  const owned = useGameStore((s) => s.game.animals.filter((a) => a.kind === kind).length);
  const room = useGameStore(shelterRoom(kind));
  const pastureLeft = useGameStore((s) => pastureCapacity(s.game) - pastureUsed(s.game));
  const shelterName = STRUCTURES[sheltersFor(kind)[0] ?? 'chickenCoop'].label;
  const blocked = room === null || room === 0 || pastureLeft < def.pastureUnits;
  const buy = useGameStore((s) => s.buyAnimal);
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
        <span className="text-xs font-bold">Você tem {owned}</span>
      </div>
      <p className="mt-0.5 text-xs font-bold text-wood/80">{animalPurpose(kind)}</p>
      <p className="flex flex-wrap gap-x-3 text-xs font-bold text-wood/80">
        <span className="flex items-center gap-1">
          Ração <Coins value={def.feedCostPerDay} />
          /dia
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
      <Button className="mt-2 w-full text-sm" disabled={money < price || blocked} onClick={() => buy(kind, breed, age)}>
        Comprar <Coins value={formatCoins(price)} />
      </Button>
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

function AnimalsTab() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold text-wood/80">
        Cada animal mora num abrigo da sua espécie, pasta por perto e dorme lá dentro. Os produtos ficam no abrigo
        até a equipe com 🪣 Tratar animais coletar. A ração é cobrada à meia-noite. Vivem cerca de 4 dias reais
        (filhote, jovem, adulto e idoso); para vender, clique no animal com a mão.
      </p>
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
  const money = useGameStore((s) => s.game.money);
  const owned = useGameStore((s) => s.game.inventory.fertilizer);
  const buy = useGameStore((s) => s.buyFertilizer);
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
      <div className="mt-2 flex gap-2">
        {QUANTITIES.map((q) => {
          const cost = FERTILIZER.price * q;
          return (
            <Button key={q} className="flex-1 text-sm" disabled={money < cost} onClick={() => buy(q)}>
              {q}× <Coins value={formatCoins(cost)} />
            </Button>
          );
        })}
      </div>
    </li>
  );
}

function MedicineRow({ id }: { id: MedicineId }) {
  const def = MEDICINES[id];
  const money = useGameStore((s) => s.game.money);
  const owned = useGameStore((s) => s.game.inventory.medicine[id] ?? 0);
  const free = useGameStore((s) => freeMedicine(s.game, id));
  const buy = useGameStore((s) => s.buyMedicine);
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
      <div className="mt-2 flex gap-2">
        {QUANTITIES.map((q) => {
          const cost = def.price * q;
          return (
            <Button key={q} className="flex-1 text-sm" disabled={money < cost} onClick={() => buy(id, q)}>
              {q}× <Coins value={formatCoins(cost)} />
            </Button>
          );
        })}
      </div>
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

export function ShopPanel() {
  const tab = useGameStore((s) => s.shopTab);
  const setTab = useGameStore((s) => s.setShopTab);
  const close = useGameStore((s) => s.closePanel);
  return (
    <Panel title="🛒 Loja" onClose={close}>
      <div className="mb-3 flex gap-2">
        <Button variant={tab === 'seeds' ? 'wood' : 'ghost'} className="flex-1" onClick={() => setTab('seeds')}>
          Sementes
        </Button>
        <Button variant={tab === 'animals' ? 'wood' : 'ghost'} className="flex-1" onClick={() => setTab('animals')}>
          Animais
        </Button>
        <Button variant={tab === 'medicine' ? 'wood' : 'ghost'} className="flex-1" onClick={() => setTab('medicine')}>
          Remédios
        </Button>
        <Button variant={tab === 'land' ? 'wood' : 'ghost'} className="flex-1" onClick={() => setTab('land')}>
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
