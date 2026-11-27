import { useMemo } from "react";
import { CROPS, CROP_IDS } from "../data/crops";
import {
  SOILS,
  SOIL_IDS,
  SOIL_RATINGS,
  SOIL_RATING_IDS,
  SOIL_SURVEY,
} from "../data/soil";
import { PLOT_COUNT } from "../game/grid";
import { canSurvey, hasAgronomist } from "../game/survey";
import {
  PASTURE_COLORS,
  RATING_COLORS,
  SOIL_COLORS,
  SOIL_OUT,
  SOIL_UNKNOWN,
} from "../scene/palette";
import {
  useGameStore,
  type SoilLayer,
  type SoilTool,
} from "../store/gameStore";
import { Panel } from "./primitives";

const LAYERS: readonly [SoilLayer, string][] = [
  ["type", "Tipo de solo"],
  ["crop", "Plantio"],
  ["pasture", "Pasto"],
];

const factor = (n: number): string => `×${n.toLocaleString("pt-BR")}`;

function Swatch({
  color,
  hatched = false,
}: {
  color: string;
  hatched?: boolean;
}) {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 shrink-0 rounded-sm ring-1 ring-wood/30"
      style={{
        background: hatched
          ? `repeating-linear-gradient(45deg, ${color} 0 3px, #d6d9dc 3px 6px)`
          : color,
      }}
    />
  );
}

function Legend() {
  const layer = useGameStore((s) => s.soilLayer);
  const crop = useGameStore((s) => s.soilCrop);
  if (layer === "crop") {
    const table = crop === "strawberry" ? null : crop;
    return (
      <ul className="flex flex-col gap-1 text-xs font-bold">
        {SOIL_RATING_IDS.map((r) => (
          <li key={r} className="flex items-center gap-2">
            <Swatch color={RATING_COLORS[r]} />
            <span className="flex-1">{SOIL_RATINGS[r].label}</span>
            <span className="text-wood/60">
              {r === "bad" ? "murcha" : factor(SOIL_RATINGS[r].yield)}
            </span>
          </li>
        ))}
        {table === null && (
          <li className="text-wood/60">
            Morango só cresce na estufa, que ignora o solo.
          </li>
        )}
      </ul>
    );
  }
  if (layer === "pasture") {
    const sorted = [...SOIL_IDS].sort(
      (a, b) => SOILS[b].pastureFactor - SOILS[a].pastureFactor,
    );
    return (
      <div className="flex flex-col gap-1.5 text-xs font-bold">
        <div className="flex items-center gap-2">
          <span>Fraco</span>
          <span
            aria-hidden
            className="h-2.5 flex-1 rounded-full"
            style={{
              background: `linear-gradient(90deg, ${PASTURE_COLORS.low}, ${PASTURE_COLORS.high})`,
            }}
          />
          <span>Rico</span>
        </div>
        <ul className="flex flex-col gap-0.5">
          {sorted.map((id) => (
            <li key={id} className="flex justify-between">
              <span>{SOILS[id].label}</span>
              <span className="text-wood/60">
                {factor(SOILS[id].pastureFactor)} de pasto
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-1 text-xs font-bold">
      {SOIL_IDS.map((id) => (
        <li key={id} className="flex items-center gap-2">
          <Swatch color={SOIL_COLORS[id]} />
          <span className="flex-1">{SOILS[id].label}</span>
          <span className="text-wood/60">
            arar {factor(SOILS[id].plowFactor)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function CropChips() {
  const crop = useGameStore((s) => s.soilCrop);
  const known = useGameStore((s) => s.game.research.unlocked.join(","));
  const setCrop = useGameStore((s) => s.setSoilCrop);
  const crops = CROP_IDS.filter(
    (id) => known.split(",").includes(id) && CROPS[id].kind !== "greenhouse",
  );
  return (
    <div className="flex flex-wrap gap-1">
      {crops.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => setCrop(id)}
          className={`rounded-lg px-2 py-1 text-xs font-extrabold ${id === crop ? "bg-leaf text-white" : "bg-parchment-dark/60 hover:bg-parchment-dark"}`}
        >
          {CROPS[id].icon} {CROPS[id].label}
        </button>
      ))}
    </div>
  );
}

function ToolButton({
  id,
  icon,
  label,
  hint,
}: {
  id: Exclude<SoilTool, null>;
  icon: string;
  label: string;
  hint: string;
}) {
  const active = useGameStore((s) => s.soilTool === id);
  const setTool = useGameStore((s) => s.setSoilTool);
  return (
    <button
      type="button"
      onClick={() => setTool(id)}
      className={`w-full rounded-xl border-2 p-2 text-left transition ${
        active
          ? "border-wood bg-coin/40"
          : "border-transparent bg-parchment-dark/60 hover:bg-parchment-dark"
      }`}
    >
      <span className="text-sm font-black">
        {icon} {label}
      </span>
      <p className="text-[11px] font-bold text-wood/70">{hint}</p>
    </button>
  );
}

function SurveyCount() {
  const unlocked = useGameStore((s) => s.game.unlockedPlots);
  const surveyed = useGameStore((s) => s.game.surveyedPlots);
  const queued = useGameStore(
    (s) => s.game.tasks.filter((t) => t.kind === "survey").length,
  );
  const reach = useMemo(() => {
    let n = 0;
    for (let p = 0; p < PLOT_COUNT; p++)
      if (canSurvey({ unlockedPlots: unlocked }, p)) n++;
    return n;
  }, [unlocked]);
  const done = surveyed.filter((p) =>
    canSurvey({ unlockedPlots: unlocked }, p),
  ).length;
  return (
    <p className="text-xs font-bold text-wood/80">
      Lotes analisados: <b>{done}</b> de {reach}
      {queued > 0 && <span className="text-wood/60"> · {queued} na fila</span>}
    </p>
  );
}

function FieldList() {
  const fields = useGameStore((s) => s.game.fields);
  const selected = useGameStore((s) => s.selectedField);
  const select = useGameStore((s) => s.selectField);
  if (fields.length === 0)
    return (
      <p className="text-xs font-bold text-wood/60">Nenhum talhão ainda.</p>
    );
  return (
    <ul className="flex flex-col gap-1">
      {fields.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            onClick={() => select(f.id === selected ? null : f.id)}
            className={`flex w-full justify-between rounded-lg px-2 py-1 text-xs font-extrabold ${
              f.id === selected
                ? "bg-coin/50"
                : "bg-parchment-dark/60 hover:bg-parchment-dark"
            }`}
          >
            <span>📐 {f.name}</span>
            <span className="text-wood/60">
              {f.w}×{f.h}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The soil view's side panel: layers, legend, survey and field tools. */
export function SoilPanel() {
  const layer = useGameStore((s) => s.soilLayer);
  const setLayer = useGameStore((s) => s.setSoilLayer);
  const close = useGameStore((s) => s.closeSoilView);
  const agronomist = useGameStore((s) => hasAgronomist(s.game));
  return (
    <Panel title="🔬 Visão do solo" onClose={close} width="w-[20rem]">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-parchment-dark/60 p-1">
          {LAYERS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setLayer(id)}
              className={`rounded-lg py-1 text-xs font-black ${id === layer ? "bg-parchment shadow ring-1 ring-wood/30" : "text-wood/70 hover:text-wood"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {layer === "crop" && <CropChips />}
        <Legend />
        <ul className="flex flex-col gap-1 border-t-2 border-wood/10 pt-2 text-xs font-bold text-wood/70">
          <li className="flex items-center gap-2">
            <Swatch color={SOIL_UNKNOWN} hatched /> Ainda não analisado
          </li>
          <li className="flex items-center gap-2">
            <Swatch color={SOIL_OUT} /> Longe demais para analisar
          </li>
        </ul>
        <SurveyCount />
        {!agronomist && (
          <p className="rounded-lg bg-coin/30 px-2 py-1.5 text-xs font-bold">
            Ninguém na equipe tem 🔬 Agronomia. Contrate um agrônomo no quadro
            da equipe (T).
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <ToolButton
            id="survey"
            icon="🔬"
            label={`Analisar lotes (${SOIL_SURVEY.cost} moedas cada)`}
            hint="Clique ou arraste sobre os lotes. Clicar de novo cancela."
          />
          <ToolButton
            id="field"
            icon="📐"
            label="Novo talhão"
            hint="Arraste um retângulo na terra da fazenda."
          />
        </div>
        <div className="flex flex-col gap-1 border-t-2 border-wood/10 pt-2">
          <h3 className="text-xs font-black text-wood/70">Talhões</h3>
          <FieldList />
        </div>
      </div>
    </Panel>
  );
}
