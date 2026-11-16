import { CROPS } from '../data/crops';
import { DAILY_WAGE, HIRE_COST, MAX_WORKERS, TASK_MINUTES, WORK_END_HOUR, WORK_START_HOUR } from '../data/workers';
import { dailyWages, workerActivity } from '../game/workers';
import type { GameState, Worker } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { formatCoins } from './format';
import { Button, Coins, Panel } from './primitives';
import { TASK_LABELS, TASK_VERBS } from './tools';

/** One-line status of a worker, as a primitive so the row only re-renders when it changes. */
const workerStatus = (game: GameState, worker: Worker): string => {
  const task = worker.taskId === null ? undefined : game.tasks.find((t) => t.id === worker.taskId);
  switch (workerActivity(game, worker)) {
    case 'resting':
      return 'Descansando em casa';
    case 'idle':
      return 'Sem tarefas';
    case 'walking':
      return task ? `A caminho: ${TASK_LABELS[task.kind].toLowerCase()}` : 'Voltando para casa';
    case 'working': {
      if (!task) return 'Trabalhando';
      const crop = task.kind === 'seed' && task.cropId ? ` ${CROPS[task.cropId].label.toLowerCase()}` : '';
      return `${TASK_VERBS[task.kind]}${crop}`;
    }
  }
};

/** Progress of the current task in 10% buckets (null when not working). */
const workerProgress = (game: GameState, worker: Worker): number | null => {
  const task = worker.taskId === null ? undefined : game.tasks.find((t) => t.id === worker.taskId);
  if (!task || worker.path.length > 0) return null;
  return Math.min(10, Math.floor((worker.progress / TASK_MINUTES[task.kind]) * 10)) * 10;
};

function WorkerRow({ id }: { id: number }) {
  const name = useGameStore((s) => s.game.workers.find((w) => w.id === id)?.name ?? '');
  const role = useGameStore((s) => s.game.workers.find((w) => w.id === id)?.role ?? '');
  const hired = useGameStore((s) => s.game.workers.find((w) => w.id === id)?.kind === 'hired');
  const status = useGameStore((s) => {
    const w = s.game.workers.find((x) => x.id === id);
    return w ? workerStatus(s.game, w) : '';
  });
  const progress = useGameStore((s) => {
    const w = s.game.workers.find((x) => x.id === id);
    return w ? workerProgress(s.game, w) : null;
  });
  const fire = useGameStore((s) => s.fire);

  return (
    <li className="flex items-center gap-3 rounded-xl bg-parchment-dark/60 p-2 pl-3">
      <span className="text-2xl" aria-hidden>
        {hired ? '🧑‍🌾' : '👪'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-black">
          {name} <span className="text-xs font-bold text-wood/70">· {role}</span>
        </p>
        <p className="truncate text-xs font-bold text-wood/80">{status}</p>
        {progress !== null && (
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-wood/20">
            <div className="h-full bg-leaf transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      {hired && (
        <Button variant="ghost" className="text-xs" onClick={() => fire(id)} title="Dispensar">
          Dispensar
        </Button>
      )}
    </li>
  );
}

function HireCard() {
  const money = useGameStore((s) => s.game.money);
  const count = useGameStore((s) => s.game.workers.length);
  const hire = useGameStore((s) => s.hire);
  const full = count >= MAX_WORKERS;
  return (
    <div className="rounded-xl border-2 border-dashed border-wood/30 p-3">
      <p className="font-black">Contratar ajudante</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs font-bold text-wood/80">
        <span className="flex items-center gap-1">
          Contratação <Coins value={formatCoins(HIRE_COST)} />
        </span>
        <span className="flex items-center gap-1">
          Salário <Coins value={formatCoins(DAILY_WAGE)} />
          /dia
        </span>
      </p>
      <Button className="mt-2 w-full" variant="leaf" disabled={full || money < HIRE_COST} onClick={hire}>
        {full ? `Limite de ${MAX_WORKERS} trabalhadores` : 'Contratar'}
      </Button>
    </div>
  );
}

export function WorkersPanel() {
  const ids = useGameStore((s) => s.game.workers.map((w) => w.id).join(','));
  const taskCount = useGameStore((s) => s.game.tasks.length);
  const wages = useGameStore((s) => dailyWages(s.game));
  const clear = useGameStore((s) => s.clearTasks);
  const close = useGameStore((s) => s.closePanel);

  return (
    <Panel title="👨‍🌾 Trabalhadores" onClose={close}>
      <div className="mb-3 flex items-center justify-between rounded-xl bg-parchment-dark/60 p-3 text-sm font-bold">
        <span>
          Tarefas na fila: <b className="tabular-nums">{taskCount}</b>
        </span>
        <Button variant="danger" className="text-xs" disabled={taskCount === 0} onClick={clear}>
          Cancelar todas
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {ids
          .split(',')
          .filter(Boolean)
          .map((id) => (
            <WorkerRow key={id} id={Number(id)} />
          ))}
      </ul>
      <div className="mt-3">
        <HireCard />
      </div>
      <p className="mt-3 text-xs font-bold text-wood/70">
        Trabalham das {WORK_START_HOUR}h às {WORK_END_HOUR}h. Os salários (
        <Coins value={formatCoins(wages)} className="text-xs" /> por dia) são pagos à meia-noite; quem não recebe vai
        embora. Mais gente na fazenda = tarefas concluídas mais rápido.
      </p>
    </Panel>
  );
}
