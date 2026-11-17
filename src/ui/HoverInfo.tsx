import { ANIMALS, ANIMAL_PRODUCTS } from '../data/animals';
import { CROPS } from '../data/crops';
import { STRUCTURES } from '../data/structures';
import { animalActivity } from '../game/animals';
import { growthProgress, isMature } from '../game/crops';
import { nextPlotCost, plotStatus } from '../game/economy';
import { plotOfTile } from '../game/grid';
import type { Tile } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { formatCoins } from './format';
import { TASK_LABELS } from './tools';
import { Card, Coins } from './primitives';

const STATE_LABELS: Record<Tile['state'], string> = {
  locked: 'Terreno à venda',
  grass: 'Grama',
  tilled: 'Terra arada',
  planted: 'Plantado (precisa de água)',
  watered: 'Regado',
};

function CropDetails({ tile }: { tile: Tile }) {
  if (!tile.crop) return null;
  const def = CROPS[tile.crop.cropId];
  const progress = growthProgress(tile.crop);
  const mature = isMature(tile.crop);
  return (
    <div className="mt-1">
      <div className="flex items-center justify-between font-extrabold">
        <span>
          {def.icon} {def.label}
        </span>
        <span className="text-sm">{mature ? 'Pronto para colher!' : `${Math.floor(progress * 100)}%`}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-wood/20">
        <div className={`h-full ${mature ? 'bg-coin' : 'bg-leaf'}`} style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

function PlotDetails({ tileIndex }: { tileIndex: number }) {
  // Selectors return primitives, so this only re-renders when the values change.
  const money = useGameStore((s) => s.game.money);
  const status = useGameStore((s) => plotStatus(s.game, plotOfTile(tileIndex)));
  const cost = useGameStore((s) => nextPlotCost(s.game));
  if (status !== 'available') {
    return <p className="text-sm">Compre um lote vizinho primeiro.</p>;
  }
  return (
    <p className="flex items-center gap-2 text-sm">
      Preço: <Coins value={formatCoins(cost)} className={money < cost ? 'text-red-700' : ''} />· clique para comprar
    </p>
  );
}

function QueuedTasks({ tileIndex }: { tileIndex: number }) {
  // Joined into a string so the selector returns a primitive.
  const queued = useGameStore((s) =>
    s.game.tasks
      .filter((t) => t.tile === tileIndex)
      .map((t) => TASK_LABELS[t.kind] + (t.workerId === null ? '' : ' (em andamento)'))
      .join(' → '),
  );
  if (!queued) return null;
  return <p className="mt-1 text-xs font-bold text-wood/80">📋 Na fila: {queued}</p>;
}

const ACTIVITY_LABELS = { walking: 'Passeando', grazing: 'Pastando', sleeping: 'Dormindo' } as const;

function AnimalInfo({ id }: { id: number }) {
  // Each selector returns a primitive, so the card only re-renders when what it shows changes.
  const kind = useGameStore((s) => s.game.animals.find((a) => a.id === id)?.kind);
  const activity = useGameStore((s) => {
    const a = s.game.animals.find((x) => x.id === id);
    return a ? animalActivity(s.game, a) : null;
  });
  const fed = useGameStore((s) => s.game.animals.find((a) => a.id === id)?.fed ?? true);
  const ready = useGameStore((s) => s.game.animals.find((a) => a.id === id)?.hasProduct ?? false);
  const progress = useGameStore((s) => {
    const a = s.game.animals.find((x) => x.id === id);
    if (!a) return 0;
    const hours = ANIMALS[a.kind].productionHours;
    return hours > 0 ? Math.min(100, Math.floor((a.productMinutes / (hours * 60)) * 100)) : 0;
  });
  if (!kind || !activity) return null;
  const def = ANIMALS[kind];
  const product = def.product ? ANIMAL_PRODUCTS[def.product] : null;
  return (
    <Card className="w-64 px-4 py-2">
      <p className="font-black">
        {def.icon} {def.label}
      </p>
      <p className="text-sm">
        {ACTIVITY_LABELS[activity]}
        {!fed && <span className="font-black text-red-700"> · com fome</span>}
      </p>
      {product &&
        (ready ? (
          <p className="text-sm font-black text-leaf">
            {product.icon} {product.label} pronto! Clique para coletar.
          </p>
        ) : (
          <div className="mt-1">
            <p className="text-xs font-bold">
              Próximo {product.label.toLowerCase()}: {progress}%
            </p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-wood/20">
              <div className="h-full bg-leaf" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ))}
      {def.labor.hoe && <p className="text-xs font-bold">Ajuda a equipe a arar mais rápido.</p>}
      {def.labor.walk && <p className="text-xs font-bold">Ajuda a equipe a andar mais rápido.</p>}
    </Card>
  );
}

/** Small card describing the animal or tile under the mouse. */
export function HoverInfo() {
  const hoveredAnimal = useGameStore((s) => s.hoveredAnimal);
  const hovered = useGameStore((s) => s.hoveredTile);
  const tile = useGameStore((s) => (s.hoveredTile === null ? undefined : s.game.tiles[s.hoveredTile]));
  if (hoveredAnimal !== null) return <AnimalInfo id={hoveredAnimal} />;
  if (hovered === null || !tile) return null;
  const title = tile.structure
    ? STRUCTURES[tile.structure].label
    : tile.road
      ? tile.state === 'locked'
        ? 'Estrada de acesso'
        : 'Estrada de terra'
      : STATE_LABELS[tile.state];
  return (
    <Card className="w-64 px-4 py-2">
      <p className="font-black">{title}</p>
      {tile.structure === 'shippingBin' && <p className="text-sm">Clique para vender sua colheita.</p>}
      {tile.structure && tile.structure !== 'shippingBin' && (
        <p className="text-sm">{STRUCTURES[tile.structure].description}</p>
      )}
      {tile.state === 'locked' && <PlotDetails tileIndex={hovered} />}
      <CropDetails tile={tile} />
      <QueuedTasks tileIndex={hovered} />
    </Card>
  );
}
