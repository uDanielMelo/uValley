import { useState } from 'react';
import { MACHINE_IDS, MACHINES, RENTAL, type MachineId, type RentalDays } from '../data/machines';
import { TASK_MINUTES } from '../data/workers';
import { rentalCost } from '../game/machines';
import { freeSlot } from '../game/parking';
import { useGameStore } from '../store/gameStore';
import { formatCoins } from './format';
import { Button, Coins } from './primitives';

const TASK_TEXT = { hoe: 'Ara', hand: 'Colhe' } as const;

/** One machine at the dealership: what it does, buying it and renting it. */
function MachineOffer({ type }: { type: MachineId }) {
  const def = MACHINES[type];
  const money = useGameStore((s) => s.game.money);
  const canOwn = useGameStore((s) => freeSlot(s.game, false) !== null);
  const canRent = useGameStore((s) => freeSlot(s.game, true) !== null);
  const buy = useGameStore((s) => s.buyMachine);
  const rent = useGameStore((s) => s.rentMachine);
  const [days, setDays] = useState<RentalDays>(1);
  const [withOperator, setWithOperator] = useState(false);
  const total = rentalCost(type, days, withOperator);
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-parchment-dark/60 p-3 text-sm font-black">
      <div className="flex items-center justify-between gap-2">
        <span>
          {def.icon} {def.label}
        </span>
        <Button className="text-xs" disabled={!canOwn || money < def.price} onClick={() => buy(type)}>
          Comprar <Coins value={formatCoins(def.price)} />
        </Button>
      </div>
      <span className="text-xs font-bold text-wood/70">
        {TASK_TEXT[def.task]} {def.workSpeed}× mais rápido ({TASK_MINUTES[def.task]} → {TASK_MINUTES[def.task] / def.workSpeed} min por
        tile) e anda {def.driveSpeed}× mais rápido. Diesel: {def.costPerHour}/h de uso.
      </span>
      {!canOwn && <span className="text-xs font-bold text-amber-700">Para comprar, construa um galpão de máquinas com vaga livre.</span>}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-wood/15 pt-2 text-xs">
        <span className="font-bold text-wood/70">Alugar ({def.rentPerDay}/dia):</span>
        {RENTAL.days.map((d) => (
          <Button key={d} variant={d === days ? 'wood' : 'ghost'} className="px-2 text-xs" onClick={() => setDays(d)}>
            {d} dia{d === 1 ? '' : 's'}
          </Button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs font-bold">
        <input type="checkbox" checked={withOperator} onChange={(e) => setWithOperator(e.target.checked)} />
        Com operador (+{RENTAL.operatorPerDay}/dia)
      </label>
      <Button className="text-xs" disabled={!canRent || money < total} onClick={() => rent(type, days, withOperator)}>
        Alugar por {days} dia{days === 1 ? '' : 's'} <Coins value={formatCoins(total)} />
      </Button>
      {!canRent && (
        <span className="text-xs font-bold text-amber-700">Para alugar, tenha um estacionamento ou galpão com estrada e vaga livre.</span>
      )}
    </li>
  );
}

/** The dealership's machines: tractor and harvester, to buy or rent. */
export function MachineShop() {
  return (
    <>
      <p className="mb-3 text-xs font-bold text-wood/80">
        Só quem tem a habilidade 🚜 Maquinário dirige. Contrate um operador na agência ou alugue a máquina com operador. O aluguel
        termina às 20h do último dia.
      </p>
      <ul className="flex flex-col gap-2">
        {MACHINE_IDS.map((id) => (
          <MachineOffer key={id} type={id} />
        ))}
      </ul>
    </>
  );
}
