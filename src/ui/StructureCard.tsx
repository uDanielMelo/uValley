import { ANIMAL_PRODUCTS, ANIMAL_PRODUCT_IDS } from '../data/animals';
import { FERTILIZER } from '../data/fertilizer';
import { SHELTER_LEVELS, SHELTER_LEVEL_IDS, STRUCTURES, type ShelterLevel, type StructureId } from '../data/structures';
import { BUNKHOUSE_BEDS, HOUSE_BEDS } from '../data/workers';
import { workProgress } from '../game/construction';
import { isKnownSick } from '../game/health';
import {
  effectiveSafety,
  lightingBonus,
  manureCap,
  manureFull,
  maxShelterLevel,
  nextShelterLevel,
  residents,
  shelterCapacity,
  shelterComfort,
  shelterDef,
  stockTotal,
} from '../game/shelters';
import { staffCount } from '../game/staff';
import { bedCount, isCutOff, refundFor, upgradeCost, upgradeMinutes } from '../game/structures';
import type { GameState, StructureInstance } from '../game/types';
import { useGameStore, type GameStore } from '../store/gameStore';
import { formatCoins, formatWorkTime } from './format';
import { Button, Card, Coins } from './primitives';
import { DockSection } from './DockPanel';
import { PenSection } from './PenSection';
import { MachineSection } from './MachineSection';
import { StorageSummary } from './StorageSummary';

const find = (s: GameStore): StructureInstance | undefined =>
  s.selectedStructure === null ? undefined : s.game.structures.find((x) => x.id === s.selectedStructure);

/** Selects a primitive from the selected structure, so the card only re-renders when it changes. */
const useSelected = <T,>(pick: (s: StructureInstance, game: GameState) => T, fallback: T): T =>
  useGameStore((s) => {
    const found = find(s);
    return found ? pick(found, s.game) : fallback;
  });

const WORK_LABELS = { build: '🚧 Em obra', upgrade: '🛠️ Em reforma', demolish: '🧨 Em demolição' } as const;

function Meter({ label, value }: { label: string; value: number }) {
  const percent = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2 text-xs font-bold">
      <span className="w-16 text-wood/70">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-wood/15">
        <div className="h-full bg-leaf" style={{ width: `${percent}%` }} />
      </div>
      <span className="w-8 text-right tabular-nums">{percent}%</span>
    </div>
  );
}

/** What a building cut off from the roads stops doing, by kind. */
const idleText = (type: StructureId): string => {
  const def = STRUCTURES[type];
  if (type === 'bunkhouse') return 'as camas não contam e a equipe dorme na frente da casa';
  if (def.shelter) return 'não recebe animais novos e a equipe não coleta o que eles produzem';
  if (def.storage) return 'não guarda nada';
  if (type === 'dock') return 'nenhum cliente consegue chegar à vaga';
  return 'fica parada';
};

/** Warning for a building that no road links to the access road. */
function RoadAccessSection({ type }: { type: StructureId }) {
  const cutOff = useSelected((s, game) => isCutOff(game, s), false);
  if (!cutOff) return null;
  return (
    <p className="rounded-lg bg-orange-100 px-2 py-1.5 text-xs font-bold text-orange-900">
      🚧 Sem acesso por estrada: {idleText(type)}. Ligue a rua em volta à estrada de acesso no modo Estrada.
    </p>
  );
}

/** Progress of the work under way, with a way to call it off. */
function WorkSection() {
  const kind = useSelected((s) => s.work?.kind ?? null, null);
  const percent = useSelected((s) => Math.floor((workProgress(s) ?? 0) * 100), 0);
  const id = useGameStore((s) => s.selectedStructure);
  const cancel = useGameStore((s) => s.demolishOrCancel);
  if (!kind || id === null) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs font-extrabold">
        <span>{WORK_LABELS[kind]}</span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-wood/15">
        <div className={`h-full ${kind === 'demolish' ? 'bg-red-700' : 'bg-leaf'}`} style={{ width: `${percent}%` }} />
      </div>
      <Button variant="ghost" className="self-start text-xs" onClick={() => cancel(id)}>
        {kind === 'build' ? 'Cancelar obra (devolve tudo)' : kind === 'upgrade' ? 'Cancelar reforma (devolve tudo)' : 'Cancelar demolição'}
      </Button>
    </div>
  );
}

/** Level, comfort, safety, residents, stock and the upgrade of an animal shelter. */
function ShelterSection({ type }: { type: StructureId }) {
  const level = useSelected((s) => s.level ?? 1, 1 as ShelterLevel);
  const upgrading = useSelected((s) => s.work?.kind === 'upgrade', false);
  const building = useSelected((s) => s.work?.kind === 'build', false);
  const heads = useSelected((s, game) => `${residents(game, s.id)}/${shelterCapacity(s)}`, '');
  const stock = useSelected((s) => {
    const items = s.stock;
    if (!items || stockTotal(items) === 0) return '';
    return ANIMAL_PRODUCT_IDS.filter((p) => (items[p] ?? 0) > 0)
      .map((p) => `${ANIMAL_PRODUCTS[p].icon} ${items[p] ?? 0}`)
      .join('  ');
  }, '');
  const safety = useSelected((s, game) => effectiveSafety(game, s), 0);
  const lit = useSelected((s, game) => lightingBonus(game, s), 0);
  const manure = useSelected((s) => `${Math.floor(s.manure ?? 0)}/${manureCap(s)}`, '');
  const manureIsFull = useSelected((s) => manureFull(s), false);
  const sick = useSelected((s, game) => game.animals.filter((a) => a.shelterId === s.id && isKnownSick(a)).length, 0);
  const carcasses = useSelected((s, game) => game.carcasses.filter((c) => c.shelterId === s.id).length, 0);
  const money = useGameStore((s) => s.game.money);
  const id = useGameStore((s) => s.selectedStructure);
  const upgrade = useGameStore((s) => s.upgradeShelter);
  const def = shelterDef(type);
  if (!def || building) return null;
  const next = nextShelterLevel({ type, level });
  const max = maxShelterLevel(type);
  const ownMax = def.maxLevel ?? 4;
  const cost = next ? upgradeCost(type, next) : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1" aria-label={`Nível ${level} de ${ownMax}`}>
        {SHELTER_LEVEL_IDS.filter((l) => l <= ownMax).map((l) => (
          <span
            key={l}
            title={SHELTER_LEVELS[l].label}
            className={`h-1.5 flex-1 rounded-full ${l <= level ? 'bg-coin' : l <= max ? 'bg-wood/20' : 'bg-wood/10'}`}
          />
        ))}
        <span className="ml-2 text-xs font-black">{SHELTER_LEVELS[level].label}</span>
      </div>
      <Meter label="Conforto" value={shelterComfort({ level })} />
      <Meter label={lit > 0 ? 'Segurança (+ postes)' : 'Segurança'} value={safety} />
      <p className="flex justify-between text-xs font-bold">
        <span className="text-wood/70">Animais</span>
        <span className="tabular-nums">{heads}</span>
      </p>
      <p className="flex justify-between text-xs font-bold">
        <span className="text-wood/70">Saúde</span>
        <span className={sick > 0 || carcasses > 0 ? 'text-red-700' : ''}>
          {sick === 0 && carcasses === 0
            ? 'todos bem'
            : [
                sick > 0 && `🤒 ${sick} doente${sick === 1 ? '' : 's'}`,
                carcasses > 0 && `☠️ ${carcasses} carcaça${carcasses === 1 ? '' : 's'}`,
              ]
                .filter(Boolean)
                .join(' · ')}
        </span>
      </p>
      <p className="flex justify-between text-xs font-bold">
        <span className="text-wood/70">Para coletar</span>
        <span>{stock || 'nada'}</span>
      </p>
      <p className="flex justify-between text-xs font-bold" title="Recolhido como adubo pela equipe (Tratar animais)">
        <span className="text-wood/70">{FERTILIZER.icon} Esterco</span>
        <span className={`tabular-nums ${manureIsFull ? 'text-red-700' : ''}`}>
          {manure}
          {manureIsFull && ' · cheio: mais doença'}
        </span>
      </p>
      <ul className="flex flex-col gap-0.5 text-xs font-bold">
        {SHELTER_LEVEL_IDS.filter((l) => l >= 2 && l <= ownMax && def.perks[l]).map((l) => (
          <li key={l} className={l <= level ? 'text-green-900' : 'text-wood/50'}>
            {l <= level ? '✓' : '·'} {def.perks[l]}
            {l > max && ' (em breve)'}
          </li>
        ))}
      </ul>
      {!upgrading && id !== null && next && (
        <Button className="flex flex-col items-center text-sm" disabled={money < cost} onClick={() => upgrade(id)}>
          <span>Melhorar para {SHELTER_LEVELS[next].label.toLowerCase()}</span>
          <span className="flex items-center gap-2 text-xs font-bold opacity-90">
            <Coins value={formatCoins(cost)} /> · obra de {formatWorkTime(upgradeMinutes(type, next))}
          </span>
        </Button>
      )}
      {!upgrading && !next && <p className="text-xs font-bold text-wood/70">Nível mais alto disponível por enquanto.</p>}
    </div>
  );
}

/** What else a structure offers: beds, the vehicles at the dock, storage, team hub. */
function ExtraSection({ type }: { type: StructureId }) {
  const beds = useGameStore((s) => `${staffCount(s.game)}/${bedCount(s.game)}`);
  const showPanel = useGameStore((s) => s.showPanel);
  const id = useGameStore((s) => s.selectedStructure);
  if (type === 'bunkhouse') {
    return (
      <div className="flex items-center justify-between text-xs font-bold">
        <span>
          Camas da fazenda: <span className="tabular-nums">{beds}</span> ({BUNKHOUSE_BEDS} por alojamento)
        </span>
        <Button variant="ghost" className="text-xs" onClick={() => showPanel('workers')}>
          Equipe
        </Button>
      </div>
    );
  }
  if (type === 'house') {
    return (
      <div className="flex items-center justify-between text-xs font-bold">
        <span>
          Camas da fazenda: <span className="tabular-nums">{beds}</span> ({HOUSE_BEDS} na casa)
        </span>
        <Button variant="ghost" className="text-xs" onClick={() => showPanel('workers')}>
          Equipe
        </Button>
      </div>
    );
  }
  if (type === 'dock') return <DockSection />;
  if (type === 'loadingPen') return id === null ? null : <PenSection penId={id} />;
  if (STRUCTURES[type].parking) return id === null ? null : <MachineSection structureId={id} />;
  const storage = STRUCTURES[type].storage;
  if (storage) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-bold text-wood/70">
          {storage ? 'Armazenamento da fazenda:' : 'A despensa da casa guarda um pouco. Armazenamento da fazenda:'}
        </p>
        <StorageSummary />
      </div>
    );
  }
  return null;
}

/** Card of the structure selected with the hand: status and the actions it offers. */
export function StructureCard() {
  const type = useSelected((s) => s.type, null as StructureId | null);
  const level = useSelected((s) => s.level ?? 1, 1 as ShelterLevel);
  const working = useSelected((s) => s.work !== undefined, false);
  const id = useGameStore((s) => s.selectedStructure);
  const select = useGameStore((s) => s.selectStructure);
  const demolish = useGameStore((s) => s.demolishOrCancel);
  if (!type || id === null) return null;
  const def = STRUCTURES[type];
  const demolishable = def.cost !== undefined && !working;
  return (
    <Card className="flex w-72 flex-col gap-2 px-4 py-3">
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="font-black">
            {def.icon} {def.label}
          </p>
          <p className="text-xs font-bold text-wood/70">{def.description}</p>
        </div>
        <button
          type="button"
          onClick={() => select(null)}
          className="rounded-md px-1.5 text-lg leading-none font-black text-wood hover:bg-parchment-dark"
          aria-label="Fechar"
        >
          ×
        </button>
      </header>
      <RoadAccessSection type={type} />
      <WorkSection />
      <ShelterSection type={type} />
      <ExtraSection type={type} />
      {demolishable && (
        <button
          type="button"
          onClick={() => demolish(id)}
          className="self-end text-[11px] font-extrabold text-red-800/80 hover:underline"
        >
          Demolir (devolve {formatCoins(refundFor(type, level))})
        </button>
      )}
    </Card>
  );
}
