import { MACHINES } from '../data/machines';
import { SHED_LEVELS } from '../data/structures';
import { MINUTES_PER_DAY } from '../data/world';
import { mechanicCost, resalePrice } from '../game/machines';
import { hasWorkshop, parkingDef } from '../game/parking';
import { upgradeCost, upgradeMinutes } from '../game/structures';
import type { Machine } from '../game/types';
import { useGameStore, type GameStore } from '../store/gameStore';
import { formatCoins, formatWorkTime } from './format';
import { Button, Coins } from './primitives';

const machineAt = (s: GameStore, parkId: number, slot: number): Machine | undefined =>
  s.game.machines.find((m) => m.parkId === parkId && m.slot === slot);

/** "dia 3, 20h" for a game minute. */
const dayAndHour = (minutes: number): string =>
  `dia ${Math.floor(minutes / MINUTES_PER_DAY) + 1}, ${Math.floor((minutes % MINUTES_PER_DAY) / 60)}h`;

/** One slot of a shed or parking lot: the machine in it, its state and what can be done with it. */
function SlotRow({ parkId, slot }: { parkId: number; slot: number }) {
  const id = useGameStore((s) => machineAt(s, parkId, slot)?.id ?? null);
  const type = useGameStore((s) => machineAt(s, parkId, slot)?.type ?? null);
  const condition = useGameStore((s) => Math.round(machineAt(s, parkId, slot)?.condition ?? 0));
  const rentedUntil = useGameStore((s) => machineAt(s, parkId, slot)?.rental?.until ?? null);
  const repairUntil = useGameStore((s) => {
    const m = machineAt(s, parkId, slot);
    return m?.repairUntil !== undefined && m.repairUntil > s.game.gameMinutes ? m.repairUntil : null;
  });
  const driver = useGameStore((s) => {
    const m = machineAt(s, parkId, slot);
    return m?.driverId === undefined ? null : (s.game.workers.find((w) => w.id === m.driverId)?.name ?? null);
  });
  const resale = useGameStore((s) => {
    const m = machineAt(s, parkId, slot);
    return m ? resalePrice(m) : 0;
  });
  const repair = useGameStore((s) => {
    const m = machineAt(s, parkId, slot);
    return m ? mechanicCost(m) : 0;
  });
  const money = useGameStore((s) => s.game.money);
  const sell = useGameStore((s) => s.sellMachine);
  const giveBack = useGameStore((s) => s.returnRental);
  const mechanic = useGameStore((s) => s.callMechanic);
  const joyride = useGameStore((s) => s.startJoyride);
  if (id === null || type === null) {
    return <li className="rounded-lg bg-parchment-dark/40 px-2 py-1 text-xs font-bold text-wood/50">Vaga {slot + 1}: livre</li>;
  }
  const def = MACHINES[type];
  const busy = driver !== null;
  return (
    <li className="flex flex-col gap-1 rounded-lg bg-parchment-dark/60 px-2 py-1.5 text-xs font-bold">
      <div className="flex items-center justify-between gap-2">
        <span className="font-black">
          {def.icon} {def.label}
        </span>
        <span className="text-wood/70">{rentedUntil === null ? 'própria' : `alugada até ${dayAndHour(rentedUntil)}`}</span>
      </div>
      {rentedUntil === null && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-wood/15">
            <div
              className={`h-full rounded-full ${condition === 0 ? 'bg-red-700' : condition < 30 ? 'bg-amber-600' : 'bg-green-700'}`}
              style={{ width: `${condition}%` }}
            />
          </div>
          <span className="tabular-nums">{condition === 0 ? 'quebrada' : `${condition}%`}</span>
        </div>
      )}
      {busy && <span className="text-wood/70">🚜 Com {driver}</span>}
      {repairUntil !== null && <span className="text-wood/70">🔧 No mecânico até {dayAndHour(repairUntil)}</span>}
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button
          variant="ghost"
          className="text-xs"
          title="Dirigir com W A S D, só por diversão"
          disabled={busy || condition === 0 || repairUntil !== null}
          onClick={() => joyride(id)}
        >
          🕹️ Dirigir
        </Button>
        {rentedUntil === null ? (
          <>
            {condition < 100 && repairUntil === null && (
              <Button variant="ghost" className="text-xs" disabled={busy || money < repair} onClick={() => mechanic(id)}>
                Chamar mecânico <Coins value={formatCoins(repair)} />
              </Button>
            )}
            <Button variant="ghost" className="text-xs" disabled={busy || repairUntil !== null} onClick={() => sell(id)}>
              Vender <Coins value={formatCoins(resale)} />
            </Button>
          </>
        ) : (
          <Button variant="ghost" className="text-xs" disabled={busy} onClick={() => giveBack(id)}>
            Devolver
          </Button>
        )}
      </div>
    </li>
  );
}

/** Card section of a machine shed or parking lot: its slots, and the workshop upgrade for the shed. */
export function MachineSection({ structureId }: { structureId: number }) {
  const slots = useGameStore((s) => {
    const park = s.game.structures.find((x) => x.id === structureId);
    return park ? (parkingDef(park)?.slots ?? 0) : 0;
  });
  const isShed = useGameStore((s) => s.game.structures.find((x) => x.id === structureId)?.type === 'machineShed');
  const workshop = useGameStore((s) => {
    const park = s.game.structures.find((x) => x.id === structureId);
    return park ? hasWorkshop(park) : false;
  });
  const upgrading = useGameStore((s) => s.game.structures.find((x) => x.id === structureId)?.work !== undefined);
  const money = useGameStore((s) => s.game.money);
  const upgrade = useGameStore((s) => s.upgradeShelter);
  const showPanel = useGameStore((s) => s.showPanel);
  const cost = upgradeCost('machineShed', 2);
  return (
    <div className="flex flex-col gap-1.5">
      <ul className="flex flex-col gap-1">
        {Array.from({ length: slots }, (_, slot) => (
          <SlotRow key={slot} parkId={structureId} slot={slot} />
        ))}
      </ul>
      {isShed && workshop && <p className="text-xs font-bold text-green-900">✓ Oficina: conserta as máquinas próprias à noite.</p>}
      {!isShed && <p className="text-xs font-bold text-wood/70">Só para máquinas alugadas.</p>}
      {isShed && !workshop && !upgrading && (
        <Button className="flex flex-col items-center text-sm" disabled={money < cost} onClick={() => upgrade(structureId)}>
          <span>Melhorar para {SHED_LEVELS[2].label.toLowerCase()}</span>
          <span className="flex items-center gap-2 text-xs font-bold opacity-90">
            <Coins value={formatCoins(cost)} /> · obra de {formatWorkTime(upgradeMinutes('machineShed', 2))}
          </span>
        </Button>
      )}
      <Button
        variant="ghost"
        className="text-xs"
        onClick={() => showPanel('machines')}
      >
        Comprar ou alugar máquinas
      </Button>
    </div>
  );
}
