import { useEffect, useMemo, useState } from 'react';
import { CROPS, type CropId } from '../data/crops';
import { SOILS, SOIL_IDS, SOIL_RATINGS } from '../data/soil';
import { MINUTES_PER_DAY } from '../data/world';
import { fieldRanking, fieldSoil } from '../game/fields';
import { tileIndex } from '../game/grid';
import { SOIL_COLORS } from '../scene/palette';
import { useGameStore } from '../store/gameStore';
import { Button, Card } from './primitives';

/** Rating label nearest to an average multiplier (for the ranking). */
const ratingOf = (average: number): string => {
  if (average >= 1.75) return SOIL_RATINGS.great.label;
  if (average >= 1.25) return SOIL_RATINGS.good.label;
  if (average >= 0.75) return SOIL_RATINGS.neutral.label;
  if (average >= 0.25) return SOIL_RATINGS.poor.label;
  return SOIL_RATINGS.bad.label;
};

const times = (n: number): string => `×${(Math.round(n * 100) / 100).toLocaleString('pt-BR')}`;

function NameInput({ id, name }: { id: number; name: string }) {
  const rename = useGameStore((s) => s.renameField);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const commit = () => {
    if (draft.trim() && draft.trim() !== name) rename(id, draft);
    else setDraft(name);
  };
  return (
    <input
      value={draft}
      maxLength={32}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(name);
          e.currentTarget.blur();
        }
      }}
      aria-label="Nome do talhão"
      className="w-full rounded-md bg-transparent px-1 font-black outline-none focus:bg-parchment-dark/70 focus:ring-2 focus:ring-wood/40"
    />
  );
}

/** The selected field: soil makeup, crop ranking, what grows there and the last harvest. */
export function FieldCard() {
  const id = useGameStore((s) => s.selectedField);
  const field = useGameStore((s) => s.game.fields.find((f) => f.id === s.selectedField));
  const seed = useGameStore((s) => s.game.soilSeed);
  const surveyed = useGameStore((s) => s.game.surveyedPlots);
  const research = useGameStore((s) => s.game.research);
  const tiles = useGameStore((s) => s.game.tiles);
  const day = useGameStore((s) => Math.floor(s.game.gameMinutes / MINUTES_PER_DAY));
  const select = useGameStore((s) => s.selectField);
  const remove = useGameStore((s) => s.removeField);

  const info = useMemo(() => {
    if (!field) return null;
    const view = { soilSeed: seed, surveyedPlots: surveyed, research, tiles };
    const soil = fieldSoil(view, field);
    const ranking = fieldRanking(view, field);
    const growing: Partial<Record<CropId, number>> = {};
    for (let y = field.y; y < field.y + field.h; y++) {
      for (let x = field.x; x < field.x + field.w; x++) {
        const crop = tiles[tileIndex(x, y)]?.crop;
        if (crop) growing[crop.cropId] = (growing[crop.cropId] ?? 0) + 1;
      }
    }
    return { soil, ranking, growing };
  }, [field, seed, surveyed, research, tiles]);

  if (id === null || !field || !info) return null;
  const { soil, ranking, growing } = info;
  const growingList = Object.entries(growing) as [CropId, number][];
  const last = field.lastHarvest;
  return (
    <Card className="flex w-72 flex-col gap-2 px-4 py-3">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <NameInput id={field.id} name={field.name} />
          <p className="px-1 text-xs font-bold text-wood/70">
            📐 {field.w}×{field.h} · {soil.total} tiles
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

      <section className="flex flex-col gap-1">
        <h3 className="text-xs font-black text-wood/70">Solo</h3>
        {soil.surveyed === 0 ? (
          <p className="text-xs font-bold text-wood/70">Ainda não analisado. Use 🔬 Analisar lotes.</p>
        ) : (
          <>
            <div className="flex h-3 overflow-hidden rounded-full ring-1 ring-wood/30">
              {SOIL_IDS.filter((t) => soil.types[t]).map((t) => (
                <span
                  key={t}
                  title={`${SOILS[t].label}: ${soil.types[t] ?? 0} tiles`}
                  style={{ width: `${((soil.types[t] ?? 0) / soil.surveyed) * 100}%`, background: SOIL_COLORS[t] }}
                />
              ))}
            </div>
            <p className="text-[11px] font-bold text-wood/80">
              {SOIL_IDS.filter((t) => soil.types[t])
                .map((t) => `${SOILS[t].label} ${Math.round(((soil.types[t] ?? 0) / soil.surveyed) * 100)}%`)
                .join(' · ')}
            </p>
            {soil.surveyed < soil.total && (
              <p className="text-[11px] font-bold text-wood/60">Falta analisar: {soil.total - soil.surveyed} tiles.</p>
            )}
          </>
        )}
      </section>

      {ranking.length > 0 && (
        <section className="flex flex-col gap-0.5">
          <h3 className="text-xs font-black text-wood/70">Melhores culturas aqui</h3>
          <ol className="flex flex-col gap-0.5 text-xs font-bold">
            {ranking.map((r, k) => (
              <li key={r.cropId} className={`flex justify-between ${k === 0 ? 'text-leaf' : ''}`}>
                <span>
                  {CROPS[r.cropId].icon} {CROPS[r.cropId].label}
                </span>
                <span className="tabular-nums">
                  {ratingOf(r.average)} ({times(r.average)})
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="flex flex-col gap-0.5 text-xs font-bold">
        <h3 className="font-black text-wood/70">Plantado agora</h3>
        {growingList.length === 0 ? (
          <p className="text-wood/60">Nada.</p>
        ) : (
          <p>{growingList.map(([c, n]) => `${CROPS[c].icon} ${n}`).join(' · ')}</p>
        )}
      </section>

      <section className="text-xs font-bold">
        <h3 className="font-black text-wood/70">Última colheita</h3>
        {last ? (
          <p>
            {last.day === day ? 'Hoje' : last.day === day - 1 ? 'Ontem' : `Dia ${last.day + 1}`}: {last.units} unidade
            {last.units === 1 ? '' : 's'} em {last.tiles} tile{last.tiles === 1 ? '' : 's'} · solo {times(last.soil / last.tiles)}
          </p>
        ) : (
          <p className="text-wood/60">Ainda sem colheita.</p>
        )}
      </section>

      <Button variant="ghost" className="self-end px-3 py-1 text-xs" onClick={() => remove(field.id)}>
        Apagar talhão
      </Button>
    </Card>
  );
}
