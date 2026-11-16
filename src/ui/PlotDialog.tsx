import { plotStatus, nextPlotCost } from '../game/economy';
import { useGameStore } from '../store/gameStore';
import { formatCoins } from './format';
import { Button, Card, Coins } from './primitives';

/** Confirmation dialog shown after clicking a locked plot. */
export function PlotDialog() {
  const plot = useGameStore((s) => s.pendingPlot);
  const status = useGameStore((s) => (s.pendingPlot === null ? null : plotStatus(s.game, s.pendingPlot)));
  const cost = useGameStore((s) => nextPlotCost(s.game));
  const money = useGameStore((s) => s.game.money);
  const confirm = useGameStore((s) => s.confirmPlot);
  const cancel = () => useGameStore.getState().requestPlot(null);
  if (plot === null || status === null) return null;

  const available = status === 'available';
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/25" onClick={cancel}>
      <div onClick={(e) => e.stopPropagation()}>
        <Card className="w-80 p-5 text-center">
          <h2 className="text-xl font-black">Comprar terreno</h2>
          {available ? (
            <>
              <p className="mt-2 font-bold">Expandir a fazenda com este lote?</p>
              <div className="my-3 flex justify-center text-2xl">
                <Coins value={formatCoins(cost)} className={money < cost ? 'text-red-700' : ''} />
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={cancel}>
                  Cancelar
                </Button>
                <Button variant="leaf" className="flex-1" disabled={money < cost} onClick={confirm}>
                  Comprar
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="my-3 font-bold">Este lote não faz divisa com a sua fazenda. Compre um lote vizinho primeiro.</p>
              <Button className="w-full" onClick={cancel}>
                Entendi
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
