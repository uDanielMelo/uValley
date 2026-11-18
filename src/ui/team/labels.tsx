import { ANIMALS } from '../../data/animals';
import { CROPS } from '../../data/crops';
import { SKILLS, type SkillId } from '../../data/workers';
import { ageBand, workEffectiveness, workSpeed } from '../../game/staff';
import type { Specialty, WorkerProfile } from '../../game/types';
import { Chip } from '../primitives';

export const specialtyLabel = (specialty: Specialty): string =>
  specialty.kind === 'crop'
    ? `${CROPS[specialty.id].icon} ${CROPS[specialty.id].label}`
    : `${ANIMALS[specialty.id].icon} ${ANIMALS[specialty.id].label}`;

export const ageLabel = (age: number): string => `${age} anos · ${ageBand(age).label}`;

/** Percent of normal (100%) for display. */
const percent = (value: number): string => `${Math.round(value * 100)}%`;

/** Speed and effectiveness on farm work (no specialty crop involved). */
export const farmingStats = (profile: WorkerProfile): { speed: string; effectiveness: string } => {
  const task = { kind: 'hoe', cropId: null } as const;
  return { speed: percent(workSpeed(profile, task)), effectiveness: percent(workEffectiveness(profile, task)) };
};

/** General skills and specialty as chips. */
export function SkillChips({ skills, specialty }: { skills: readonly SkillId[]; specialty: Specialty | null }) {
  return (
    <span className="flex flex-wrap gap-1">
      {skills.map((id) => (
        <Chip key={id}>
          {SKILLS[id].icon} {SKILLS[id].label}
        </Chip>
      ))}
      {specialty && <Chip tone="leaf">★ {specialtyLabel(specialty)}</Chip>}
    </span>
  );
}
