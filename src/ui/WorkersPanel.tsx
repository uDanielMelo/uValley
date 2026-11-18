import { useState } from 'react';
import { TEMP_WORKERS, WORK_END_HOUR, WORK_START_HOUR } from '../data/workers';
import { hourlyPayroll, staffCount, tempCount } from '../game/staff';
import { bedCount } from '../game/structures';
import { unstaffedKinds } from '../game/workers';
import { useGameStore } from '../store/gameStore';
import { formatCoins } from './format';
import { Button, Coins, Panel } from './primitives';
import { HireBoard } from './team/HireBoard';
import { WorkerList } from './team/WorkerList';
import { TASK_LABELS, TOOLS } from './tools';

type Tab = 'team' | 'hire';

function Summary() {
  const staff = useGameStore((s) => staffCount(s.game));
  const beds = useGameStore((s) => bedCount(s.game));
  const temps = useGameStore((s) => tempCount(s.game));
  const payroll = useGameStore((s) => hourlyPayroll(s.game));
  return (
    <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold">
      <div className="rounded-xl bg-parchment-dark/60 p-2">
        <p className="text-wood/70">🛏️ Camas</p>
        <p className={`text-base font-black tabular-nums ${staff >= beds ? 'text-red-700' : ''}`}>
          {staff}/{beds}
        </p>
      </div>
      <div className="rounded-xl bg-parchment-dark/60 p-2">
        <p className="text-wood/70">🦺 Esporádicos</p>
        <p className="text-base font-black tabular-nums">
          {temps}/{TEMP_WORKERS.max}
        </p>
      </div>
      <div className="rounded-xl bg-parchment-dark/60 p-2">
        <p className="text-wood/70">Folha por hora</p>
        <p className="flex justify-center text-base">
          <Coins value={formatCoins(payroll)} />
        </p>
      </div>
    </div>
  );
}

function QueueBar() {
  const taskCount = useGameStore((s) => s.game.tasks.length);
  const orphans = useGameStore((s) => unstaffedKinds(s.game).join(','));
  const clear = useGameStore((s) => s.clearTasks);
  return (
    <div className="rounded-xl bg-parchment-dark/60 p-3 text-sm font-bold">
      <div className="flex items-center justify-between">
        <span>
          Tarefas na fila: <b className="tabular-nums">{taskCount}</b>
        </span>
        <Button variant="danger" className="text-xs" disabled={taskCount === 0} onClick={clear}>
          Cancelar todas
        </Button>
      </div>
      {orphans && (
        <p className="mt-1 text-xs text-red-700">
          Ninguém faz:{' '}
          {TOOLS.filter((t) => orphans.split(',').includes(t.id))
            .map((t) => TASK_LABELS[t.id])
            .join(', ')}
          . Adicione a atividade na ficha de alguém.
        </p>
      )}
    </div>
  );
}

/** Team hub: who works on the farm (cards with attributes and priorities) and the hiring board. */
export function WorkersPanel() {
  const [tab, setTab] = useState<Tab>('team');
  const close = useGameStore((s) => s.closePanel);
  const selected = useGameStore((s) => s.selectedWorker);
  const current: Tab = selected !== null ? 'team' : tab;
  const select = useGameStore((s) => s.selectWorker);
  const show = (next: Tab) => {
    if (next === 'hire') select(null);
    setTab(next);
  };

  return (
    <Panel title="👨‍🌾 Equipe" onClose={close} width="w-[26rem]">
      <div className="flex flex-col gap-3">
        <Summary />
        <div className="flex gap-1 rounded-xl bg-wood/10 p-1" role="tablist">
          {(
            [
              ['team', 'Trabalhadores'],
              ['hire', 'Contratar'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={current === id}
              onClick={() => show(id)}
              className={`flex-1 rounded-lg py-1 text-sm font-black ${current === id ? 'bg-parchment shadow' : 'text-wood/70 hover:bg-parchment/50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {current === 'team' ? (
          <>
            <QueueBar />
            <WorkerList />
          </>
        ) : (
          <HireBoard />
        )}
        <p className="text-xs font-bold text-wood/70">
          Expediente das {WORK_START_HOUR}h às {WORK_END_HOUR}h. Fixos recebem a cada hora de expediente; quem não
          recebe vai embora. Cada um pega primeiro as atividades do topo da própria lista.
        </p>
      </div>
    </Panel>
  );
}
