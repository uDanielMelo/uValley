import { ANIMAL_PRODUCTS, ANIMAL_PRODUCT_IDS } from '../data/animals';
import { FERTILIZER } from '../data/fertilizer';
import { MEDICINES, MEDICINE_IDS } from '../data/health';
import { StorageSummary } from './StorageSummary';
import { CROPS, CROP_IDS } from '../data/crops';
import { produceValue } from '../game/economy';
import { useGameStore } from '../store/gameStore';
import { formatCoins } from './format';
import { Button, Coins, Panel } from './primitives';

function ProduceList() {
  const produce = useGameStore((s) => s.game.inventory.produce);
  const sell = useGameStore((s) => s.sell);
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
            <Button className="text-sm" onClick={() => sell(id, 1)}>
              Vender 1
            </Button>
            <Button className="text-sm" onClick={() => sell(id, count)}>
              <Coins value={formatCoins(def.sellPrice * count)} />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function AnimalProductList() {
  const products = useGameStore((s) => s.game.inventory.products);
  const sell = useGameStore((s) => s.sellProduct);
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
            <Button className="text-sm" onClick={() => sell(id, 1)}>
              Vender 1
            </Button>
            <Button className="text-sm" onClick={() => sell(id, count)}>
              <Coins value={formatCoins(def.sellPrice * count)} />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function SeedList() {
  const seeds = useGameStore((s) => s.game.inventory.seeds);
  return (
    <ul className="grid grid-cols-3 gap-2">
      {CROP_IDS.map((id) => (
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
  const sellAll = useGameStore((s) => s.sellAll);
  return (
    <Panel title="🎒 Inventário" onClose={close}>
      <StorageSummary />
      <h3 className="mt-3 mb-2 font-black">Colheitas</h3>
      <ProduceList />
      <AnimalProductList />
      <Button variant="leaf" className="mt-3 w-full" disabled={total <= 0} onClick={sellAll}>
        Vender tudo · <Coins value={formatCoins(total)} />
      </Button>
      <h3 className="mt-5 mb-2 font-black">Sementes</h3>
      <SeedList />
      <h3 className="mt-5 mb-2 font-black">Insumos</h3>
      <MedicineList />
    </Panel>
  );
}
