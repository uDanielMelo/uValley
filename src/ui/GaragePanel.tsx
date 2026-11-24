import { FREIGHT, VEHICLE_BAY } from '../data/docks';
import { VEHICLES, VEHICLE_LEVELS, type VehicleLevel } from '../data/market';
import { nextVehicle } from '../game/market';
import { hasBay } from '../game/shipments';
import { useGameStore } from '../store/gameStore';
import { MachineShop } from './MachineShop';
import { formatCoins } from './format';
import { Button, Coins, Panel } from './primitives';

/** One freight vehicle: capacity, rates, the bay it needs, and its contract or choice. */
function VehicleRow({ level }: { level: VehicleLevel }) {
  const def = VEHICLES[level];
  const contracted = useGameStore((s) => level <= s.game.vehicleLevel);
  const isNext = useGameStore((s) => nextVehicle(s.game.vehicleLevel) === level);
  const chosen = useGameStore((s) => s.game.freightVehicle === level);
  const money = useGameStore((s) => s.game.money);
  const truckBay = useGameStore((s) => hasBay(s.game, 'truck'));
  const upgrade = useGameStore((s) => s.upgradeVehicle);
  const choose = useGameStore((s) => s.setFreightVehicle);
  const needsTruckBay = VEHICLE_BAY[level] === 'truck';
  return (
    <li className={`flex flex-col gap-1 rounded-xl p-3 text-sm font-black ${chosen ? 'bg-coin/30 ring-2 ring-wood/40' : 'bg-parchment-dark/60'}`}>
      <div className="flex items-center justify-between gap-2">
        <span>
          {def.icon} {def.label}
        </span>
        {contracted ? (
          <Button variant={chosen ? 'wood' : 'ghost'} className="text-xs" onClick={() => choose(level)}>
            {chosen ? 'Sempre este' : 'Usar sempre'}
          </Button>
        ) : isNext ? (
          <Button className="text-xs" disabled={money < def.price} onClick={upgrade}>
            Contratar <Coins value={formatCoins(def.price)} />
          </Button>
        ) : (
          <Coins value={formatCoins(def.price)} className="text-wood/50" />
        )}
      </div>
      <span className="text-xs font-bold text-wood/70">
        {def.capacity} kg por viagem · frete {FREIGHT[level].base} + {FREIGHT[level].perKg.toLocaleString('pt-BR')}/kg
      </span>
      {needsTruckBay && (
        <span className={`text-xs font-bold ${truckBay ? 'text-green-900' : 'text-amber-700'}`}>
          {truckBay ? '✓ A doca tem vaga de caminhão' : 'Precisa de vaga de caminhão (doca nível 3)'}
        </span>
      )}
    </li>
  );
}

/** Freight contracts, and which vehicle the freight comes with. */
function FreightTab() {
  const auto = useGameStore((s) => s.game.freightVehicle === 'auto');
  const choose = useGameStore((s) => s.setFreightVehicle);
  return (
    <>
      <p className="mb-3 text-xs font-bold text-wood/80">
        Contrate veículos de frete maiores: levam mais por viagem e cobram menos por kg. O frete das vendas e das compras
        vem com o veículo escolhido.
      </p>
      <button
        type="button"
        onClick={() => choose('auto')}
        className={`mb-2 w-full rounded-xl p-3 text-left text-sm font-black ${auto ? 'bg-coin/30 ring-2 ring-wood/40' : 'bg-parchment-dark/60 hover:bg-parchment-dark'}`}
      >
        ⚙️ Automático {auto && '✓'}
        <span className="block text-xs font-bold text-wood/70">Cada carga vem no menor veículo contratado em que ela cabe.</span>
      </button>
      <ul className="flex flex-col gap-2">
        {VEHICLE_LEVELS.map((l) => (
          <VehicleRow key={l} level={l} />
        ))}
      </ul>
    </>
  );
}

const TABS = [
  { id: 'freight', label: '🚚 Frete' },
  { id: 'machines', label: '🚜 Máquinas' },
] as const;

/** Dealership: freight contracts, and farm machines to buy or rent. */
export function GaragePanel() {
  const close = useGameStore((s) => s.closePanel);
  const tab = useGameStore((s) => s.garageTab);
  const setTab = useGameStore((s) => s.setGarageTab);
  return (
    <Panel title="🚘 Concessionária" onClose={close}>
      <div className="mb-3 flex gap-1.5">
        {TABS.map((t) => (
          <Button key={t.id} variant={tab === t.id ? 'wood' : 'ghost'} className="flex-1 text-xs" onClick={() => setTab(t.id)}>
            {t.label}
          </Button>
        ))}
      </div>
      {tab === 'freight' ? <FreightTab /> : <MachineShop />}
    </Panel>
  );
}
