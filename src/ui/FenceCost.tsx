import type { FencePlan } from '../game/fences';
import { formatCoins } from './format';
import { Card, Coins } from './primitives';

const PIECE_LABELS = { straight: 'reta', diagonal: 'diagonal', gate: 'porteira' } as const;

/** What a dragged fence line costs: tiles, coins and the materials it takes. */
export function FenceCost({ plan, money }: { plan: FencePlan; money: number }) {
  const short = money < plan.cost;
  return (
    <Card className="pointer-events-none w-56 -translate-y-full px-3 py-2 text-xs font-bold">
      <div className="flex items-center justify-between gap-2 text-sm font-black">
        <span>
          🪵 {plan.valid.length} tile(s) · {PIECE_LABELS[plan.piece]}
        </span>
        <Coins value={formatCoins(plan.cost)} className={short ? 'text-red-700' : ''} />
      </div>
      {plan.materials.length > 0 && (
        <ul className="mt-1 text-wood/80">
          {plan.materials.map((m) => (
            <li key={m.id} className="flex justify-between">
              <span>{m.label}</span>
              <span>
                {m.amount} {m.unit}
              </span>
            </li>
          ))}
        </ul>
      )}
      {plan.blocked.length > 0 && <p className="mt-1 text-red-700">{plan.blocked.length} tile(s) ocupado(s) serão pulados</p>}
      {short && <p className="mt-1 text-red-700">Dinheiro insuficiente</p>}
    </Card>
  );
}
