import { useMemo } from 'react';
import { ANIMALS, ANIMAL_PRODUCTS, ANIMAL_PRODUCT_IDS, BREEDS, LIFE_STAGES } from '../data/animals';
import { FERTILIZER } from '../data/fertilizer';
import { DISEASES } from '../data/health';
import { CROPS } from '../data/crops';
import { ROAD_COST } from '../data/roads';
import { STRUCTURES, type StructureId } from '../data/structures';
import { animalActivity, animalProduct, lifeStage } from '../game/animals';
import { levelDef, manureUnits, residents, shelterCapacity, shelterDef, stockCap, stockTotal } from '../game/shelters';
import { growthProgress, isMature } from '../game/crops';
import { nextPlotCost, plotStatus } from '../game/economy';
import { previewPlacement, workProgress } from '../game/construction';
import { plotOfTile, tileCoords } from '../game/grid';
import { anchorFor, buildCost, isCutOff, needsRoadAccess, structureAt } from '../game/structures';
import type { Tile } from '../game/types';
import { ERROR_MESSAGES, useGameStore } from '../store/gameStore';
import { formatCoins } from './format';
import { taskLabel } from './tools';
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

/** Placing a structure: its price with the road ring, what is in the way and whether a road reaches it. */
function BuildDetails({ type, tileIndex }: { type: StructureId; tileIndex: number }) {
  const rotation = useGameStore((s) => s.buildRotation);
  // These change only on game events, so the preview is recomputed only then.
  const tiles = useGameStore((s) => s.game.tiles);
  const tasks = useGameStore((s) => s.game.tasks);
  const money = useGameStore((s) => s.game.money);
  const preview = useMemo(() => {
    const { x, y } = tileCoords(tileIndex);
    const at = anchorFor(type, x, y, rotation);
    return previewPlacement(useGameStore.getState().game, type, at.x, at.y, rotation);
  }, [type, tileIndex, rotation, tiles, tasks, money]);
  const def = STRUCTURES[type];
  const roads = preview.newRoads.length;
  return (
    <Card className="w-72 px-4 py-2">
      <p className="font-black">
        {def.icon} {def.label}
      </p>
      <p className="flex items-center gap-2 text-sm">
        Obra: <Coins value={formatCoins(buildCost(type))} />
        {roads > 0 && (
          <>
            + rua ({roads} × {ROAD_COST}): <Coins value={formatCoins(roads * ROAD_COST)} />
          </>
        )}
      </p>
      {roads > 0 && (
        <p className="flex items-center gap-2 text-sm font-extrabold">
          Total: <Coins value={formatCoins(preview.cost)} className={money < preview.cost ? 'text-red-700' : ''} />
        </p>
      )}
      {preview.error && <p className="text-xs font-black text-red-700">{ERROR_MESSAGES[preview.error]}</p>}
      {!preview.error && !preview.connects && (
        <p className="text-xs font-black text-orange-700">
          A rua em volta não chega à estrada de acesso: puxe uma estrada até ela, senão a construção fica parada.
        </p>
      )}
      {!preview.error && preview.connects && needsRoadAccess(type) && (
        <p className="text-xs font-bold text-wood/70">A rua em volta liga na estrada de acesso.</p>
      )}
    </Card>
  );
}

/** A building no road reaches: it stands idle until one does. */
function RoadAccessDetails({ tileIndex }: { tileIndex: number }) {
  const cutOff = useGameStore((s) => {
    const found = structureAt(s.game, tileIndex);
    return !!found && isCutOff(s.game, found);
  });
  if (!cutOff) return null;
  return <p className="text-xs font-black text-orange-700">🚧 Sem acesso por estrada: está parada.</p>;
}

/** Site or demolition under way on the hovered structure: progress and crew at work. */
function WorkDetails({ tileIndex }: { tileIndex: number }) {
  // Primitive selectors: they only re-render when the numbers shown change.
  const kind = useGameStore((s) => structureAt(s.game, tileIndex)?.work?.kind ?? null);
  const percent = useGameStore((s) => {
    const found = structureAt(s.game, tileIndex);
    const progress = found ? workProgress(found) : null;
    return progress === null ? 0 : Math.floor(progress * 100);
  });
  const crew = useGameStore((s) => {
    const found = structureAt(s.game, tileIndex);
    if (!found) return 0;
    const ids = new Set(
      s.game.tasks.filter((t) => t.job?.type === 'structure' && t.job.structureId === found.id).map((t) => t.id),
    );
    return s.game.workers.filter((w) => w.taskId !== null && ids.has(w.taskId) && w.path.length === 0).length;
  });
  if (!kind) return null;
  return (
    <div className="mt-1">
      <div className="flex items-center justify-between text-sm font-extrabold">
        <span>{kind === 'build' ? '🚧 Em obra' : kind === 'upgrade' ? '🛠️ Em reforma' : '🧨 Em demolição'}</span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-wood/20">
        <div className={`h-full ${kind === 'demolish' ? 'bg-red-700' : 'bg-leaf'}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-xs font-bold text-wood/80">
        {crew > 0 ? `${crew} trabalhando agora` : 'Esperando alguém com Obras nas atividades'}
      </p>
    </div>
  );
}

/** Who lives in the hovered shelter and what is waiting there to be collected. */
function ShelterDetails({ tileIndex }: { tileIndex: number }) {
  // Strings and numbers only, so the card re-renders just when they change.
  const summary = useGameStore((s) => {
    const found = structureAt(s.game, tileIndex);
    const def = found ? shelterDef(found.type) : undefined;
    if (!found || !def || found.work?.kind === 'build') return null;
    return `${residents(s.game, found.id)}/${shelterCapacity(found)} · ${levelDef(found).label}`;
  });
  const stock = useGameStore((s) => {
    const found = structureAt(s.game, tileIndex);
    if (!found) return '';
    const stock = found.stock ?? {};
    const manure = manureUnits(found);
    return [
      ...ANIMAL_PRODUCT_IDS.filter((id) => (stock[id] ?? 0) > 0).map((id) => `${ANIMAL_PRODUCTS[id].icon} ${stock[id] ?? 0}`),
      ...(manure > 0 ? [`${FERTILIZER.icon} ${manure}`] : []),
    ].join('  ');
  });
  const full = useGameStore((s) => {
    const found = structureAt(s.game, tileIndex);
    return !!found && stockCap(found) > 0 && stockTotal(found.stock) >= stockCap(found);
  });
  const sick = useGameStore((s) => {
    const found = structureAt(s.game, tileIndex);
    return found ? s.game.animals.filter((a) => a.shelterId === found.id && a.health?.noticed).length : 0;
  });
  if (summary === null) return null;
  return (
    <div className="mt-1 text-xs font-bold">
      <p>
        Animais: {summary}
        {sick > 0 && <span className="text-red-700"> · 🤒 {sick} doente{sick === 1 ? '' : 's'}</span>}
      </p>
      <p className={full ? 'text-red-700' : 'text-wood/80'}>
        {stock ? `Para coletar: ${stock}${full ? ' · cheio, a produção parou' : ''}` : 'Nada para coletar.'}
      </p>
    </div>
  );
}

function QueuedTasks({ tileIndex }: { tileIndex: number }) {
  // Joined into a string so the selector returns a primitive. Structure work shows in WorkDetails.
  const queued = useGameStore((s) =>
    s.game.tasks
      .filter((t) => t.tile === tileIndex && t.job?.type !== 'structure' && t.job?.type !== 'shelter')
      .map((t) => taskLabel(s.game, t) + (t.workerId === null ? '' : ' (em andamento)'))
      .join(' → '),
  );
  if (!queued) return null;
  return <p className="mt-1 text-xs font-bold text-wood/80">📋 Na fila: {queued}</p>;
}

const ACTIVITY_LABELS = { walking: 'Passeando', grazing: 'Pastando', sleeping: 'Dormindo' } as const;

function AnimalInfo({ id }: { id: number }) {
  // Each selector returns a primitive, so the card only re-renders when what it shows changes.
  const kind = useGameStore((s) => s.game.animals.find((a) => a.id === id)?.kind);
  const breed = useGameStore((s) => s.game.animals.find((a) => a.id === id)?.breed);
  const stars = useGameStore((s) => s.game.animals.find((a) => a.id === id)?.stars ?? 1);
  const stage = useGameStore((s) => {
    const a = s.game.animals.find((x) => x.id === id);
    return a ? lifeStage(s.game.gameMinutes, a) : 'adult';
  });
  const activity = useGameStore((s) => {
    const a = s.game.animals.find((x) => x.id === id);
    return a ? animalActivity(s.game, a) : null;
  });
  const fed = useGameStore((s) => s.game.animals.find((a) => a.id === id)?.fed ?? true);
  const disease = useGameStore((s) => {
    const a = s.game.animals.find((x) => x.id === id);
    return a?.health?.noticed ? a.health.disease : null;
  });
  const home = useGameStore((s) => {
    const shelterId = s.game.animals.find((a) => a.id === id)?.shelterId;
    const shelter = s.game.structures.find((x) => x.id === shelterId);
    return shelter ? STRUCTURES[shelter.type].label : null;
  });
  const progress = useGameStore((s) => {
    const a = s.game.animals.find((x) => x.id === id);
    if (!a) return 0;
    const hours = ANIMALS[a.kind].productionHours;
    return hours > 0 ? Math.min(100, Math.floor((a.productMinutes / (hours * 60)) * 100)) : 0;
  });
  if (!kind || !breed || !activity) return null;
  const def = ANIMALS[kind];
  const productId = animalProduct({ kind, breed });
  const product = productId ? ANIMAL_PRODUCTS[productId] : null;
  return (
    <Card className="w-64 px-4 py-2">
      <p className="font-black">
        {def.icon} {def.label} {BREEDS[breed].label}
      </p>
      <p className="text-xs font-bold text-wood/70">
        {'★'.repeat(stars)} · {LIFE_STAGES[stage].label} · clique para ver
      </p>
      <p className="text-sm">
        {ACTIVITY_LABELS[activity]}
        {home && ` · mora no ${home.toLowerCase()}`}
        {!fed && <span className="font-black text-red-700"> · com fome</span>}
        {disease && (
          <span className="font-black text-red-700">
            {' '}
            · {DISEASES[disease].icon} {DISEASES[disease].label.toLowerCase()}
          </span>
        )}
      </p>
      {product && (
        <div className="mt-1">
          <p className="text-xs font-bold">
            Próximo {product.label.toLowerCase()}: {progress}%
          </p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-wood/20">
            <div className="h-full bg-leaf" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {def.labor.hoe && <p className="text-xs font-bold">Ajuda a equipe a arar mais rápido.</p>}
      {def.labor.walk && <p className="text-xs font-bold">Ajuda a equipe a andar mais rápido.</p>}
    </Card>
  );
}

/** Small card describing the animal or tile under the mouse. */
export function HoverInfo() {
  const hoveredAnimal = useGameStore((s) => s.hoveredAnimal);
  const selectedAnimal = useGameStore((s) => s.selectedAnimal);
  const hovered = useGameStore((s) => s.hoveredTile);
  const tile = useGameStore((s) => (s.hoveredTile === null ? undefined : s.game.tiles[s.hoveredTile]));
  // The selected structure already has its card open.
  const onSelected = useGameStore(
    (s) => s.selectedStructure !== null && s.hoveredTile !== null && structureAt(s.game, s.hoveredTile)?.id === s.selectedStructure,
  );
  const buildMode = useGameStore((s) => s.buildMode);
  if (hoveredAnimal !== null) return hoveredAnimal === selectedAnimal ? null : <AnimalInfo id={hoveredAnimal} />;
  if (hovered !== null && buildMode && buildMode !== 'road' && buildMode !== 'demolish') {
    return <BuildDetails type={buildMode} tileIndex={hovered} />;
  }
  if (hovered === null || !tile || onSelected) return null;
  // Greenhouse crops and orchard trees never need the watering can.
  const selfWatered = tile.state === 'planted' && (tile.cover || (tile.crop && CROPS[tile.crop.cropId].kind === 'orchard'));
  const title = tile.structure
    ? STRUCTURES[tile.structure].label
    : tile.road
      ? tile.state === 'locked'
        ? 'Estrada de acesso'
        : 'Estrada de terra'
      : `${selfWatered ? 'Plantado' : STATE_LABELS[tile.state]}${tile.fertilized ? ` · ${FERTILIZER.icon} adubado` : ''}${tile.cover ? ' · na estufa' : ''}`;
  return (
    <Card className="w-64 px-4 py-2">
      <p className="font-black">{title}</p>
      {tile.structure === 'shippingBin' && <p className="text-sm">Clique para vender sua colheita.</p>}
      {tile.structure && tile.structure !== 'shippingBin' && (
        <p className="text-sm">{STRUCTURES[tile.structure].description}</p>
      )}
      {tile.structure && <RoadAccessDetails tileIndex={hovered} />}
      {tile.structure && <WorkDetails tileIndex={hovered} />}
      {tile.structure && <ShelterDetails tileIndex={hovered} />}
      {tile.state === 'locked' && <PlotDetails tileIndex={hovered} />}
      <CropDetails tile={tile} />
      <QueuedTasks tileIndex={hovered} />
    </Card>
  );
}
