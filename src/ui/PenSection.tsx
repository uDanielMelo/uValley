import { ANIMALS, BREEDS } from '../data/animals';
import { LIVESTOCK, PEN } from '../data/docks';
import { checkBuyer, livestockFreight, penHeads, penPrice, stressFactor, waitingInPen } from '../game/pen';
import { ERROR_MESSAGES, useGameStore, type GameStore } from '../store/gameStore';
import { ShipmentCard } from './DockPanel';
import { formatCoins } from './format';
import { Button, Coins } from './primitives';

/** "id:kind:breed:price:stress%" per penned animal of a pen (re-renders only when one of those changes). */
const pennedKey = (penId: number) => (s: GameStore): string =>
  s.game.animals
    .filter((a) => a.penned?.penId === penId)
    .map((a) => `${a.id}:${a.kind}:${a.breed}:${penPrice(s.game.gameMinutes, a)}:${Math.round(stressFactor(s.game.gameMinutes, a) * 100)}`)
    .join(',');

/** The loading pen's card: who waits for a buyer, what they are worth, and the livestock truck. */
export function PenSection({ penId }: { penId: number }) {
  const key = useGameStore(pennedKey(penId));
  const heads = useGameStore((s) => penHeads(s.game, penId));
  const freight = useGameStore((s) => livestockFreight(waitingInPen(s.game, penId)));
  const waiting = useGameStore((s) => waitingInPen(s.game, penId).length);
  const waitingValue = useGameStore((s) => waitingInPen(s.game, penId).reduce((sum, a) => sum + penPrice(s.game.gameMinutes, a), 0));
  const error = useGameStore((s) => checkBuyer(s.game, penId));
  const trucks = useGameStore((s) =>
    s.game.shipments
      .filter((x) => x.dockId === penId && x.phase !== 'leaving')
      .map((x) => x.id)
      .join(','),
  );
  const call = useGameStore((s) => s.callBuyer);
  const penned = key
    .split(',')
    .filter(Boolean)
    .map((entry) => {
      const [id, kind, breed, price, stress] = entry.split(':');
      return { id: Number(id), kind, breed, price: Number(price), stress: Number(stress) };
    });
  return (
    <div className="flex flex-col gap-2">
      <p className="flex justify-between text-xs font-bold">
        <span className="text-wood/70">No curral (ou a caminho)</span>
        <span className="tabular-nums">
          {heads}/{PEN.capacity}
        </span>
      </p>
      {penned.length === 0 ? (
        <p className="rounded-xl bg-parchment-dark/60 p-2.5 text-xs font-bold text-wood/80">
          Nenhum animal à venda. Clique num animal com a mão e escolha "Separar para venda": a equipe com Tratar animais
          traz ele para cá.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-xs font-bold">
          {penned.map((a) => {
            const def = a.kind && a.kind in ANIMALS ? ANIMALS[a.kind as keyof typeof ANIMALS] : null;
            const breed = a.breed && a.breed in BREEDS ? BREEDS[a.breed as keyof typeof BREEDS] : null;
            return (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-parchment-dark/60 px-2 py-1">
                <span>
                  {def?.icon} {def?.label} {breed?.label}
                  {a.stress < 100 && <span className="text-amber-700"> · estressado ({a.stress}%)</span>}
                </span>
                <Coins value={formatCoins(a.price)} />
              </li>
            );
          })}
        </ul>
      )}
      {trucks
        .split(',')
        .filter(Boolean)
        .map((id) => (
          <ShipmentCard key={id} id={Number(id)} />
        ))}
      {waiting > 0 && (
        <>
          <Button variant="leaf" className="flex flex-col items-center text-sm" disabled={error !== null} onClick={() => call(penId)}>
            <span>Chamar comprador ({waiting} {waiting === 1 ? 'animal' : 'animais'})</span>
            <span className="flex items-center gap-2 text-xs font-bold opacity-90">
              frete <Coins value={formatCoins(freight)} /> · valem <Coins value={formatCoins(waitingValue)} />
            </span>
          </Button>
          {error && error !== 'not-penned' && <p className="text-xs font-bold text-red-700">{ERROR_MESSAGES[error]}</p>}
        </>
      )}
      <p className="text-[11px] font-bold text-wood/60">
        O boiadeiro leva até {LIVESTOCK.maxHeads} por viagem e a equipe embarca (Carga). Depois de {PEN.stress.graceHours} h no curral
        os animais perdem valor, e à noite o curral é aberto aos predadores.
      </p>
    </div>
  );
}
