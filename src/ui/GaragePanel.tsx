import { VEHICLES, VEHICLE_LEVELS } from '../data/market';
import { FREIGHT } from '../data/docks';
import { nextVehicle } from '../game/market';
import { useGameStore } from '../store/gameStore';
import { formatCoins } from './format';
import { Button, Coins, Panel } from './primitives';

/** Dealership: the farm's vehicle and the trade-ups. */
export function GaragePanel() {
  const close = useGameStore((s) => s.closePanel);
  const level = useGameStore((s) => s.game.vehicleLevel);
  const money = useGameStore((s) => s.game.money);
  const upgrade = useGameStore((s) => s.upgradeVehicle);
  const next = nextVehicle(level);
  return (
    <Panel title="🚘 Concessionária" onClose={close}>
      <p className="mb-3 text-xs font-bold text-wood/80">
        O frete das vendas vem com este veículo. Quanto maior, mais peso por viagem e menos frete por kg.
      </p>
      <ul className="flex flex-col gap-2">
        {VEHICLE_LEVELS.map((l) => {
          const def = VEHICLES[l];
          const owned = l <= level;
          return (
            <li
              key={l}
              className={`flex items-center justify-between rounded-xl p-3 text-sm font-black ${
                l === level ? 'bg-coin/30 ring-2 ring-wood/40' : 'bg-parchment-dark/60'
              }`}
            >
              <span>
                {def.icon} {def.label}
                <span className="block text-xs font-bold text-wood/70">
                  {def.capacity} kg por viagem · frete {FREIGHT[l].base} + {FREIGHT[l].perKg.toLocaleString('pt-BR')}/kg
                </span>
              </span>
              {l === level ? (
                <span className="text-xs">Seu veículo</span>
              ) : owned ? (
                <span className="text-xs text-wood/50">Trocado</span>
              ) : l === next ? (
                <Button className="text-xs" disabled={money < def.price} onClick={upgrade}>
                  Trocar <Coins value={formatCoins(def.price)} />
                </Button>
              ) : (
                <Coins value={formatCoins(def.price)} className="text-wood/50" />
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
