import { ANIMALS, ANIMAL_PRODUCTS, BREEDS, GAME_MINUTES_PER_REAL_HOUR, LIFE_STAGES, LIFE_STAGE_IDS, LIFESPAN_REAL_HOURS } from '../data/animals';
import { DISEASES, MEDICINES, type DiseaseId } from '../data/health';
import { STRUCTURES } from '../data/structures';
import {
  animalProduct,
  animalSalePrice,
  draftStrength,
  lifeProgress,
  lifeStage,
  minutesToLive,
  productionRate,
} from '../game/animals';
import { freeMedicine, healthFactor, isKnownSick, medicateTaskFor, minutesToDeath } from '../game/health';
import type { Animal, GameState } from '../game/types';
import { emptyCart, purchaseFreight } from '../game/purchases';
import { useGameStore, type GameStore } from '../store/gameStore';
import { formatCoins } from './format';
import { Button, Card, Coins, Stars } from './primitives';

const find = (s: GameStore): Animal | undefined =>
  s.selectedAnimal === null ? undefined : s.game.animals.find((a) => a.id === s.selectedAnimal);

/** Selects a primitive from the selected animal, so the card only re-renders when it changes. */
const useAnimal = <T,>(pick: (a: Animal, game: GameState) => T, fallback: T): T =>
  useGameStore((s) => {
    const found = find(s);
    return found ? pick(found, s.game) : fallback;
  });

/** Real time left at speed 1×, e.g. "31 h" or "40 min". */
const formatLifeLeft = (gameMinutes: number): string => {
  const hours = gameMinutes / GAME_MINUTES_PER_REAL_HOUR;
  return hours >= 1 ? `${Math.floor(hours)} h` : `${Math.max(1, Math.round(hours * 60))} min`;
};

/** Life bar with the stage boundaries marked. */
function LifeBar({ progress }: { progress: number }) {
  return (
    <div className="relative h-2 overflow-hidden rounded-full bg-wood/15">
      <div className="h-full bg-leaf" style={{ width: `${progress * 100}%` }} />
      {LIFE_STAGE_IDS.slice(1).map((id) => (
        <span
          key={id}
          className="absolute top-0 h-full w-0.5 bg-parchment"
          style={{ left: `${(LIFE_STAGES[id].startsAtRealHours / LIFESPAN_REAL_HOURS) * 100}%` }}
        />
      ))}
    </div>
  );
}

/** Sickness line: what it has, how long it has left untreated, and whether medicine is on the way. */
function HealthLine({ id, disease }: { id: number; disease: DiseaseId }) {
  const def = DISEASES[disease];
  const medicine = MEDICINES[def.medicine];
  const deadline = useAnimal((a, game) => {
    const left = minutesToDeath(game.gameMinutes, a);
    return left === null ? null : formatLifeLeft(left);
  }, null);
  const queued = useGameStore((s) => !!medicateTaskFor(s.game.tasks, id));
  const doses = useGameStore((s) => freeMedicine(s.game, def.medicine));
  const order = useGameStore((s) => s.orderNow);
  const level = useGameStore((s) => s.game.vehicleLevel);
  const cart = { ...emptyCart(), medicine: { [def.medicine]: 1 } };
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-red-700/10 px-2 py-1.5 text-xs font-bold">
      <p className="flex justify-between gap-2 text-red-800">
        <span>
          {def.icon} {def.label}
        </span>
        {deadline && <span title="Tempo real na velocidade 1×">morre em {deadline} sem remédio</span>}
      </p>
      <p className="text-[11px] text-wood/70">{def.note}</p>
      {queued ? (
        <p className="text-[11px] text-leaf">
          {medicine.icon} {medicine.label} a caminho: a equipe vai medicar (Tratar animais).
        </p>
      ) : (
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-wood/70">
            {doses > 0 ? `${medicine.icon} ${medicine.label} no estoque` : `Sem ${medicine.label.toLowerCase()} no estoque`}
          </span>
          <Button
            variant="ghost"
            className="shrink-0 text-[11px] whitespace-nowrap"
            title="Chega pelo frete na doca"
            onClick={() => order(cart)}
          >
            Pedir 1 <Coins value={formatCoins(medicine.price + purchaseFreight(level, cart))} />
          </Button>
        </div>
      )}
    </div>
  );
}

/** Card of the animal selected with the hand: breed, stars, age, production and selling. */
export function AnimalCard() {
  const kind = useAnimal((a) => a.kind, null);
  const breed = useAnimal((a) => a.breed, null);
  const stars = useAnimal((a) => a.stars, 1);
  const fed = useAnimal((a) => a.fed, true);
  const stage = useAnimal((a, game) => lifeStage(game.gameMinutes, a), 'adult');
  // Rounded so the card does not re-render every frame.
  const life = useAnimal((a, game) => Math.floor(lifeProgress(game.gameMinutes, a) * 200) / 200, 0);
  const left = useAnimal((a, game) => formatLifeLeft(minutesToLive(game.gameMinutes, a)), '');
  const rate = useAnimal(
    (a, game) => {
      const now = game.gameMinutes;
      const rate = animalProduct(a) ? productionRate(now, a) * healthFactor(now, a) : draftStrength(now, a);
      return Math.round(rate * 100);
    },
    0,
  );
  const price = useAnimal((a, game) => animalSalePrice(game.gameMinutes, a), 0);
  const home = useAnimal((a, game) => {
    const s = game.structures.find((x) => x.id === a.shelterId);
    return s ? STRUCTURES[s.type].label : '';
  }, '');
  const disease = useAnimal((a) => (isKnownSick(a) ? (a.health?.disease ?? null) : null), null);
  const id = useGameStore((s) => s.selectedAnimal);
  const select = useGameStore((s) => s.selectAnimal);
  const sell = useGameStore((s) => s.sellAnimal);
  if (!kind || !breed || id === null) return null;
  const def = ANIMALS[kind];
  const productId = animalProduct({ kind, breed });
  const product = productId ? ANIMAL_PRODUCTS[productId] : null;
  const draft = def.labor.hoe ? 'Ajuda a arar' : def.labor.walk ? 'Leva a equipe mais rápido' : null;
  return (
    <Card className="flex w-72 flex-col gap-2 px-4 py-3">
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="font-black">
            {def.icon} {def.label} {BREEDS[breed].label}
          </p>
          <p className="text-xs font-bold text-wood/70">
            <Stars value={stars} /> · {LIFE_STAGES[stage].label} · mora no {home.toLowerCase()}
          </p>
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
      <div className="flex flex-col gap-1">
        <LifeBar progress={life} />
        <p className="flex justify-between text-[11px] font-bold text-wood/70">
          <span>Filhote · Jovem · Adulto · Idoso</span>
          <span title="Tempo real na velocidade 1×">vive mais {left}</span>
        </p>
      </div>
      {disease && <HealthLine id={id} disease={disease} />}
      <p className="flex justify-between text-xs font-bold">
        <span className="text-wood/70">{product ? `${product.icon} ${product.label}` : draft}</span>
        <span className="tabular-nums">{product ? `ritmo ${rate}%` : `força ${rate}%`}</span>
      </p>
      <p className="text-[11px] font-bold text-wood/70">
        {BREEDS[breed].note}
        {!fed && <span className="text-red-700"> Com fome hoje: sem produção.</span>}
      </p>
      <Button variant="ghost" className="self-start text-xs" onClick={() => sell(id)}>
        Vender <Coins value={formatCoins(price)} />
      </Button>
    </Card>
  );
}
