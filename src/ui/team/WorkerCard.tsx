import { DEFAULT_PRIORITIES, SEVERANCE_HOURS } from '../../data/workers';
import { severanceFor } from '../../game/staff';
import type { GameState, ToolId } from '../../game/types';
import { useGameStore } from '../../store/gameStore';
import { formatCoins } from '../format';
import { Button, Coins } from '../primitives';
import { TASK_LABELS, TOOLS } from '../tools';
import { ageLabel, farmingStats, SkillChips } from './labels';

const ICONS: Record<ToolId, string> = Object.fromEntries(TOOLS.map((t) => [t.id, t.icon])) as Record<ToolId, string>;

const find = (s: { game: GameState }, id: number) => s.game.workers.find((w) => w.id === id);

/** Assigned activities in priority order: toggle each one and move it up or down. */
function Priorities({ id }: { id: number }) {
  const list = useGameStore((s) => find(s, id)?.priorities);
  const setPriorities = useGameStore((s) => s.setPriorities);
  if (!list) return null;
  const off = DEFAULT_PRIORITIES.filter((k) => !list.includes(k));
  const move = (index: number, step: -1 | 1) => {
    const next = list.slice();
    const other = next[index + step];
    const current = next[index];
    if (other === undefined || current === undefined) return;
    next[index + step] = current;
    next[index] = other;
    setPriorities(id, next);
  };
  return (
    <div>
      <p className="mb-1 text-xs font-black text-wood/70">Atividades (de cima para baixo = prioridade)</p>
      <ol className="flex flex-col gap-1">
        {list.map((kind, i) => (
          <li key={kind} className="flex items-center gap-2 rounded-lg bg-parchment px-2 py-1 text-sm font-extrabold">
            <span className="w-4 text-xs text-wood/60 tabular-nums">{i + 1}</span>
            <span aria-hidden>{ICONS[kind]}</span>
            <span className="flex-1">{TASK_LABELS[kind]}</span>
            <button
              type="button"
              className="rounded px-1.5 hover:bg-parchment-dark disabled:opacity-30"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label={`Subir ${TASK_LABELS[kind]}`}
            >
              ▲
            </button>
            <button
              type="button"
              className="rounded px-1.5 hover:bg-parchment-dark disabled:opacity-30"
              disabled={i === list.length - 1}
              onClick={() => move(i, 1)}
              aria-label={`Descer ${TASK_LABELS[kind]}`}
            >
              ▼
            </button>
            <button
              type="button"
              className="rounded px-1.5 text-red-700 hover:bg-parchment-dark"
              onClick={() => setPriorities(id, list.filter((k) => k !== kind))}
              aria-label={`Tirar ${TASK_LABELS[kind]}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>
      {off.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {off.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setPriorities(id, [...list, kind])}
              className="rounded-lg border-2 border-dashed border-wood/30 px-2 py-0.5 text-xs font-extrabold text-wood/80 hover:bg-parchment"
            >
              + {ICONS[kind]} {TASK_LABELS[kind]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Attributes, activities and dismissal of one worker (opened from the list or by clicking them on the farm). */
export function WorkerCard({ id }: { id: number }) {
  const age = useGameStore((s) => find(s, id)?.age ?? 0);
  const stars = useGameStore((s) => find(s, id)?.stars ?? 1);
  const skills = useGameStore((s) => find(s, id)?.skills);
  const specialty = useGameStore((s) => find(s, id)?.specialty ?? null);
  const wage = useGameStore((s) => find(s, id)?.hourlyWage ?? 0);
  const temp = useGameStore((s) => find(s, id)?.kind === 'temp');
  const severance = useGameStore((s) => {
    const w = find(s, id);
    return w ? severanceFor(w) : 0;
  });
  const money = useGameStore((s) => s.game.money);
  const dismiss = useGameStore((s) => s.dismiss);
  if (!skills) return null;
  const stats = farmingStats({ name: '', age, stars, skills, specialty, hourlyWage: wage });

  return (
    <div className="flex flex-col gap-3 border-t-2 border-wood/15 px-3 pt-2 pb-3">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-bold">
        <dt className="text-wood/70">Idade</dt>
        <dd>{ageLabel(age)}</dd>
        <dt className="text-wood/70">Salário</dt>
        <dd>{temp ? 'Pago na contratação' : <><Coins value={formatCoins(wage)} className="text-xs" /> /h</>}</dd>
        <dt className="text-wood/70">Ritmo no plantio</dt>
        <dd className="tabular-nums">{stats.speed}</dd>
        <dt className="text-wood/70">Efetividade no plantio</dt>
        <dd className="tabular-nums">{stats.effectiveness}</dd>
      </dl>
      <SkillChips skills={skills} specialty={specialty} />
      <Priorities id={id} />
      <Button
        variant="ghost"
        className="self-end text-xs"
        disabled={money < severance}
        onClick={() => dismiss(id)}
        title={temp ? 'Esporádicos saem sem custo' : `Rescisão: ${SEVERANCE_HOURS} h de salário`}
      >
        {temp ? 'Dispensar' : <>Dispensar · rescisão <Coins value={formatCoins(severance)} className="text-xs" /></>}
      </Button>
    </div>
  );
}
