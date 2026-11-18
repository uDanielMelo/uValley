import { MAX_WORKERS, TEMP_WORKERS, WORK_END_HOUR, WORK_START_HOUR } from '../../data/workers';
import { freeBeds, tempCount, tempHireCost } from '../../game/staff';
import { useGameStore } from '../../store/gameStore';
import { formatCoins } from '../format';
import { Button, Coins, Stars } from '../primitives';
import { ageLabel, farmingStats, SkillChips } from './labels';

function CandidateCard({ id }: { id: number }) {
  const candidate = useGameStore((s) => s.game.candidates.find((c) => c.id === id));
  const money = useGameStore((s) => s.game.money);
  const beds = useGameStore((s) => freeBeds(s.game));
  const full = useGameStore((s) => s.game.workers.length >= MAX_WORKERS);
  const hire = useGameStore((s) => s.hireCandidate);
  if (!candidate) return null;
  const stats = farmingStats(candidate);
  const reason = full ? 'Equipe completa' : beds <= 0 ? 'Sem cama livre' : money < candidate.hireCost ? 'Sem dinheiro' : null;

  return (
    <li className="flex flex-col gap-2 rounded-xl bg-parchment-dark/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-black">
            {candidate.name} <Stars value={candidate.stars} />
          </p>
          <p className="text-xs font-bold text-wood/80">{ageLabel(candidate.age)}</p>
        </div>
        <div className="text-right text-xs font-bold">
          <p className="flex items-center justify-end gap-1">
            <Coins value={formatCoins(candidate.hourlyWage)} className="text-xs" /> /h
          </p>
          <p className="text-wood/70">
            plantio: ritmo {stats.speed} · efetiv. {stats.effectiveness}
          </p>
        </div>
      </div>
      <SkillChips skills={candidate.skills} specialty={candidate.specialty} />
      <Button variant="leaf" className="text-sm" disabled={reason !== null} onClick={() => hire(id)}>
        {reason ?? (
          <span className="flex items-center justify-center gap-1">
            Contratar · <Coins value={formatCoins(candidate.hireCost)} />
          </span>
        )}
      </Button>
    </li>
  );
}

function TempCard() {
  const cost = useGameStore((s) => tempHireCost(s.game.gameMinutes));
  const temps = useGameStore((s) => tempCount(s.game));
  const money = useGameStore((s) => s.game.money);
  const full = useGameStore((s) => s.game.workers.length >= MAX_WORKERS);
  const hire = useGameStore((s) => s.hireTemp);
  const reason =
    cost === null
      ? `Só das ${WORK_START_HOUR}h às ${TEMP_WORKERS.latestHireHour}h`
      : full
        ? 'Equipe completa'
        : temps >= TEMP_WORKERS.max
          ? `Limite de ${TEMP_WORKERS.max} por dia`
          : money < cost
            ? 'Sem dinheiro'
            : null;
  return (
    <div className="rounded-xl border-2 border-dashed border-orange-700/40 p-3">
      <p className="font-black">🦺 Esporádico (diária)</p>
      <p className="mt-0.5 text-xs font-bold text-wood/80">
        Estrelas e habilidades aleatórias, não ocupa cama e vai embora às {WORK_END_HOUR}h. Custa{' '}
        <Coins value={formatCoins(TEMP_WORKERS.hourlyRate)} className="text-xs" /> por hora restante, pago na hora.
      </p>
      <Button className="mt-2 w-full text-sm" disabled={reason !== null} onClick={hire}>
        {reason ?? (
          <span className="flex items-center justify-center gap-1">
            Chamar · <Coins value={formatCoins(cost ?? 0)} />
          </span>
        )}
      </Button>
    </div>
  );
}

/** Today's candidates and the day-laborer option. */
export function HireBoard() {
  const ids = useGameStore((s) => s.game.candidates.map((c) => c.id).join(','));
  return (
    <div className="flex flex-col gap-3">
      {ids ? (
        <ul className="flex flex-col gap-2">
          {ids.split(',').map((id) => (
            <CandidateCard key={id} id={Number(id)} />
          ))}
        </ul>
      ) : (
        <p className="text-sm font-bold text-wood/70">Todos os candidatos de hoje foram contratados.</p>
      )}
      <p className="text-xs font-bold text-wood/60">Novos candidatos chegam à meia-noite.</p>
      <TempCard />
    </div>
  );
}
