import { useState } from 'react';
import { ANIMALS, ANIMAL_IDS, ANIMAL_PRODUCTS, PLOT_PASTURE_UNITS, type AnimalId } from '../data/animals';
import { STRUCTURES } from '../data/structures';
import { CROPS, CROP_IDS, type CropId } from '../data/crops';
import { PLOT_SIZE } from '../data/world';
import { animalSalePrice } from '../game/animals';
import { freeSlots, housesKind, pastureCapacity, pastureUsed, sheltersFor } from '../game/shelters';
import { isOperational } from '../game/structures';
import { nextPlotCost } from '../game/economy';
import { useGameStore, type GameStore } from '../store/gameStore';
import { formatCoins, formatHours } from './format';
import { Button, Coins, Panel } from './primitives';

const QUANTITIES = [1, 5, 10] as const;

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
        <span>Cresce em {formatHours(def.growthHours)} regado</span>
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

function AnimalRow({ kind }: { kind: AnimalId }) {
  const def = ANIMALS[kind];
  const money = useGameStore((s) => s.game.money);
  const owned = useGameStore((s) => s.game.animals.filter((a) => a.kind === kind).length);
  const room = useGameStore(shelterRoom(kind));
  const pastureLeft = useGameStore((s) => pastureCapacity(s.game) - pastureUsed(s.game));
  const shelterName = STRUCTURES[sheltersFor(kind)[0] ?? 'chickenCoop'].label;
  const blocked = room === null || room === 0 || pastureLeft < def.pastureUnits;
  const buy = useGameStore((s) => s.buyAnimal);
  const sell = useGameStore((s) => s.sellAnimal);
  const product = def.product ? ANIMAL_PRODUCTS[def.product] : null;
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
      <div className="mt-2 flex gap-2">
        <Button className="flex-1 text-sm" disabled={money < def.purchaseCost || blocked} onClick={() => buy(kind)}>
          Comprar <Coins value={formatCoins(def.purchaseCost)} />
        </Button>
        <Button variant="ghost" className="text-sm" disabled={owned === 0} onClick={() => sell(kind)}>
          Vender <Coins value={formatCoins(animalSalePrice(kind))} />
        </Button>
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

function AnimalsTab() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold text-wood/80">
        Cada animal mora num abrigo da sua espécie, pasta por perto e dorme lá dentro. Os produtos ficam no abrigo
        até a equipe com 🧺 Tratar animais coletar. A ração é cobrada à meia-noite.
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
  const [tab, setTab] = useState<'seeds' | 'animals' | 'land'>('seeds');
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
        <Button variant={tab === 'land' ? 'wood' : 'ghost'} className="flex-1" onClick={() => setTab('land')}>
          Terrenos
        </Button>
      </div>
      {tab === 'seeds' && (
        <ul className="flex flex-col gap-2">
          {CROP_IDS.map((id) => (
            <SeedRow key={id} id={id} />
          ))}
        </ul>
      )}
      {tab === 'animals' && <AnimalsTab />}
      {tab === 'land' && <LandTab />}
    </Panel>
  );
}
