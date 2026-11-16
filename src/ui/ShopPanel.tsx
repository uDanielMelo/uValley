import { useState } from 'react';
import { ANIMALS, ANIMAL_IDS, ANIMAL_PRODUCTS, type AnimalId } from '../data/animals';
import { CROPS, CROP_IDS, type CropId } from '../data/crops';
import { PLOT_SIZE } from '../data/world';
import { animalSalePrice } from '../game/animals';
import { nextPlotCost } from '../game/economy';
import { useGameStore } from '../store/gameStore';
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

function AnimalRow({ kind }: { kind: AnimalId }) {
  const def = ANIMALS[kind];
  const money = useGameStore((s) => s.game.money);
  const owned = useGameStore((s) => s.game.animals.filter((a) => a.kind === kind).length);
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
      </p>
      <div className="mt-2 flex gap-2">
        <Button className="flex-1 text-sm" disabled={money < def.purchaseCost} onClick={() => buy(kind)}>
          Comprar <Coins value={formatCoins(def.purchaseCost)} />
        </Button>
        <Button variant="ghost" className="text-sm" disabled={owned === 0} onClick={() => sell(kind)}>
          Vender <Coins value={formatCoins(animalSalePrice(kind))} />
        </Button>
      </div>
    </li>
  );
}

function AnimalsTab() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold text-wood/80">
        Os animais pastam na grama da fazenda (não pisam na terra arada) e dormem à noite. A ração é cobrada à
        meia-noite. Clique em um animal com produto pronto para coletar.
      </p>
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
