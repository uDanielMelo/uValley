import { ANIMAL_PRODUCTS, ANIMAL_PRODUCT_IDS } from '../data/animals';
import { FERTILIZER } from '../data/fertilizer';
import { MEDICINES, MEDICINE_IDS } from '../data/health';
import { StorageSummary } from './StorageSummary';
import { CROPS, CROP_IDS } from '../data/crops';
import { produceValue } from '../game/economy';
import { useGameStore } from '../store/gameStore';
import { formatCoins } from './format';
import { Coins, Panel } from './primitives';

function ProduceList() {
  const produce = useGameStore((s) => s.game.inventory.produce);
  const items = CROP_IDS.filter((id) => (produce[id] ?? 0) > 0);
  if (items.length === 0) {
    return <p className="rounded-xl bg-parchment-dark/60 p-3 text-sm font-bold">Nenhuma colheita ainda.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((id) => {
        const count = produce[id] ?? 0;
        const def = CROPS[id];
        return (
          <li key={id} className="flex items-center gap-2 rounded-xl bg-parchment-dark/60 p-2 pl-3">
            <span className="flex-1 font-black">
              {def.icon} {def.label} <span className="tabular-nums">×{count}</span>
            </span>
            <Coins value={formatCoins(def.sellPrice * count)} className="text-sm" />
          </li>
        );
      })}
    </ul>
  );
}

function AnimalProductList() {
  const products = useGameStore((s) => s.game.inventory.products);
  const items = ANIMAL_PRODUCT_IDS.filter((id) => (products[id] ?? 0) > 0);
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {items.map((id) => {
        const count = products[id] ?? 0;
        const def = ANIMAL_PRODUCTS[id];
        return (
          <li key={id} className="flex items-center gap-2 rounded-xl bg-parchment-dark/60 p-2 pl-3">
            <span className="flex-1 font-black">
              {def.icon} {def.label} <span className="tabular-nums">×{count}</span>
            </span>
            <Coins value={formatCoins(def.sellPrice * count)} className="text-sm" />
          </li>
        );
      })}
    </ul>
  );
}

function SeedList() {
  const seeds = useGameStore((s) => s.game.inventory.seeds);
  const known = useGameStore((s) => s.game.research.unlocked.join(','));
  return (
    <ul className="grid grid-cols-3 gap-2">
      {CROP_IDS.filter((id) => known.split(',').includes(id) || (seeds[id] ?? 0) > 0).map((id) => (
        <li key={id} className="rounded-xl bg-parchment-dark/60 p-2 text-center text-sm font-black">
          <div className="text-xl">{CROPS[id].icon}</div>
          {CROPS[id].label}
          <div className="tabular-nums">×{seeds[id] ?? 0}</div>
        </li>
      ))}
    </ul>
  );
}

function MedicineList() {
  const medicine = useGameStore((s) => s.game.inventory.medicine);
  const fertilizer = useGameStore((s) => s.game.inventory.fertilizer);
  return (
    <ul className="grid grid-cols-3 gap-2">
      <li
        className="rounded-xl bg-parchment-dark/60 p-2 text-center text-sm font-black"
        title="Esterco curtido: adube terra arada ou plantada (tecla 5)"
      >
        <div className="text-xl">{FERTILIZER.icon}</div>
        {FERTILIZER.label}
        <div className="tabular-nums">×{fertilizer}</div>
      </li>
      {MEDICINE_IDS.map((id) => (
        <li key={id} className="rounded-xl bg-parchment-dark/60 p-2 text-center text-sm font-black" title={MEDICINES[id].note}>
          <div className="text-xl">{MEDICINES[id].icon}</div>
          {MEDICINES[id].label}
          <div className="tabular-nums">×{medicine[id] ?? 0}</div>
        </li>
      ))}
    </ul>
  );
}

export function InventoryPanel() {
  const close = useGameStore((s) => s.closePanel);
  const total = useGameStore((s) => produceValue(s.game));
  return (
    <Panel title="🎒 Inventário" onClose={close}>
      <StorageSummary />
      <h3 className="mt-3 mb-2 font-black">Colheitas</h3>
      <ProduceList />
      <AnimalProductList />
      <p className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-parchment-dark/60 px-3 py-2 text-xs font-bold">
        <span>Vale cerca de</span>
        <Coins value={formatCoins(total)} />
      </p>
      <p className="mt-1.5 text-xs font-bold text-wood/70">
        Venda para os clientes que estacionam na doca ou leve ao mercado da cidade.
      </p>
      <h3 className="mt-5 mb-2 font-black">Sementes</h3>
      <SeedList />
      <h3 className="mt-5 mb-2 font-black">Insumos</h3>
      <MedicineList />
    </Panel>
  );
}
