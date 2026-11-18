import { CROPS } from '../../data/crops';
import type { GameState, Worker } from '../../game/types';
import { taskProgress, workerActivity } from '../../game/workers';
import { useGameStore } from '../../store/gameStore';
import { Stars } from '../primitives';
import { taskLabel, taskVerb } from '../tools';
import { WorkerCard } from './WorkerCard';

/** One-line status of a worker, as a primitive so the row only re-renders when it changes. */
const workerStatus = (game: GameState, worker: Worker): string => {
  const task = worker.taskId === null ? undefined : game.tasks.find((t) => t.id === worker.taskId);
  switch (workerActivity(game, worker)) {
    case 'resting':
      return 'Descansando no alojamento';
    case 'idle':
      return worker.priorities.length === 0 ? 'Sem atividades designadas' : 'Sem tarefas';
    case 'walking':
      return task ? `A caminho: ${taskLabel(game, task).toLowerCase()}` : 'Voltando para o alojamento';
    case 'working': {
      if (!task) return 'Trabalhando';
      const crop = task.kind === 'seed' && task.cropId ? ` ${CROPS[task.cropId].label.toLowerCase()}` : '';
      return `${taskVerb(game, task)}${crop}`;
    }
  }
};

/** Progress of the current task (the whole site for structure work) in 10% buckets (null when not working). */
const workerProgress = (game: GameState, worker: Worker): number | null => {
  if (worker.path.length > 0) return null;
  const progress = taskProgress(game, worker);
  return progress === null ? null : Math.min(10, Math.floor(progress * 10)) * 10;
};

const find = (s: { game: GameState }, id: number) => s.game.workers.find((w) => w.id === id);

function WorkerRow({ id }: { id: number }) {
  const name = useGameStore((s) => find(s, id)?.name ?? '');
  const stars = useGameStore((s) => find(s, id)?.stars ?? 1);
  const temp = useGameStore((s) => find(s, id)?.kind === 'temp');
  const status = useGameStore((s) => {
    const w = find(s, id);
    return w ? workerStatus(s.game, w) : '';
  });
  const progress = useGameStore((s) => {
    const w = find(s, id);
    return w ? workerProgress(s.game, w) : null;
  });
  const open = useGameStore((s) => s.selectedWorker === id);
  const select = useGameStore((s) => s.selectWorker);

  return (
    <li className={`rounded-xl ${open ? 'bg-parchment-dark ring-2 ring-wood/40' : 'bg-parchment-dark/60'}`}>
      <button
        type="button"
        onClick={() => select(open ? null : id)}
        className="flex w-full items-center gap-3 p-2 pl-3 text-left"
        aria-expanded={open}
      >
        <span className="text-2xl" aria-hidden>
          {temp ? '🦺' : '🧑‍🌾'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-black">
            {name} <Stars value={stars} />
            {temp && <span className="text-xs font-bold text-orange-700">esporádico</span>}
          </p>
          <p className="truncate text-xs font-bold text-wood/80">{status}</p>
          {progress !== null && (
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-wood/20">
              <div className="h-full bg-leaf transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
        <span className="text-sm font-black text-wood/60" aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && <WorkerCard id={id} />}
    </li>
  );
}

export function WorkerList() {
  // Re-renders only when someone is hired or leaves.
  const ids = useGameStore((s) => s.game.workers.map((w) => w.id).join(','));
  if (!ids) return <p className="text-sm font-bold text-wood/70">Ninguém trabalhando na fazenda. Contrate na aba ao lado.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {ids.split(',').map((id) => (
        <WorkerRow key={id} id={Number(id)} />
      ))}
    </ul>
  );
}
