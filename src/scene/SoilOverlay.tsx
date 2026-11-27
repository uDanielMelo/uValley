import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { CanvasTexture, Color, Matrix4, MeshBasicMaterial, PlaneGeometry, type InstancedMesh } from 'three';
import { CROPS } from '../data/crops';
import { GRID_SIZE, PLOT_SIZE } from '../data/world';
import { PLOT_COUNT, TILE_COUNT, plotCoords, plotOfTile } from '../game/grid';
import { cropRating, pastureFactor, soilAt } from '../game/soil';
import { canSurvey } from '../game/survey';
import { useGameStore } from '../store/gameStore';
import { indexToWorld } from './coords';
import { PASTURE_COLORS, RATING_COLORS, SOIL_COLORS, SOIL_OUT, SOIL_UNKNOWN } from './palette';

const noRaycast = () => null;
const HALF = GRID_SIZE / 2;
/** Above the ground and the furrows' base, under structures (like the blueprint paper). */
const Y = 0.035;

const SOIL = Object.fromEntries(Object.entries(SOIL_COLORS).map(([k, v]) => [k, new Color(v)])) as Record<keyof typeof SOIL_COLORS, Color>;
const RATING = Object.fromEntries(Object.entries(RATING_COLORS).map(([k, v]) => [k, new Color(v)])) as Record<
  keyof typeof RATING_COLORS,
  Color
>;
const PASTURE_LOW = new Color(PASTURE_COLORS.low);
const PASTURE_HIGH = new Color(PASTURE_COLORS.high);
const UNKNOWN = new Color(SOIL_UNKNOWN);
const OUT = new Color(SOIL_OUT);
/** Pasture factors run from 0.5 to 1.5 (data/soil.ts). */
const PASTURE_MIN = 0.5;
const PASTURE_SPAN = 1;

/** Diagonal hatching with a question mark: plots not analyzed yet. */
const hatchTexture = (): CanvasTexture => {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.strokeStyle = 'rgba(230,233,236,0.75)';
    ctx.lineWidth = 5;
    for (let k = -size; k < size * 2; k += 22) {
      ctx.beginPath();
      ctx.moveTo(k, 0);
      ctx.lineTo(k + size, size);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', size / 2, size / 2 + 4);
  }
  return new CanvasTexture(canvas);
};

/**
 * Soil view: every tile painted by the chosen layer (soil type, how a crop does, pasture), plots not
 * analyzed yet hatched with a "?" and plots out of the survey's reach dark.
 */
export function SoilOverlay() {
  const active = useGameStore((s) => s.infoView === 'soil');
  return active ? <Overlay /> : null;
}

function Overlay() {
  const tilesRef = useRef<InstancedMesh>(null);
  const hatchRef = useRef<InstancedMesh>(null);
  const tiles = useGameStore((s) => s.game.tiles);
  const seed = useGameStore((s) => s.game.soilSeed);
  const surveyed = useGameStore((s) => s.game.surveyedPlots);
  const unlocked = useGameStore((s) => s.game.unlockedPlots);
  const layer = useGameStore((s) => s.soilLayer);
  const crop = useGameStore((s) => s.soilCrop);

  const tileGeometry = useMemo(() => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  const plotGeometry = useMemo(() => new PlaneGeometry(PLOT_SIZE, PLOT_SIZE).rotateX(-Math.PI / 2), []);
  const tileMaterial = useMemo(() => new MeshBasicMaterial({ transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false }), []);
  const hatch = useMemo(hatchTexture, []);
  const hatchMaterial = useMemo(
    () => new MeshBasicMaterial({ map: hatch, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
    [hatch],
  );
  useEffect(
    () => () => {
      for (const d of [tileGeometry, plotGeometry, tileMaterial, hatch, hatchMaterial]) d.dispose();
    },
    [tileGeometry, plotGeometry, tileMaterial, hatch, hatchMaterial],
  );

  useLayoutEffect(() => {
    const mesh = tilesRef.current;
    const hatchMesh = hatchRef.current;
    if (!mesh || !hatchMesh) return;
    const known = new Set(surveyed);
    const reach = new Set<number>();
    for (let p = 0; p < PLOT_COUNT; p++) if (canSurvey({ unlockedPlots: unlocked }, p)) reach.add(p);
    const m = new Matrix4();
    const color = new Color();
    let count = 0;
    tiles.forEach((tile, i) => {
      // Buildings and roads stay uncovered, so the map keeps its landmarks.
      if (tile.structure || tile.road) return;
      const plot = plotOfTile(i);
      const soil = soilAt(seed, i);
      if (!reach.has(plot)) color.copy(OUT);
      else if (!known.has(plot) || !soil) color.copy(UNKNOWN);
      else if (layer === 'type') color.copy(SOIL[soil]);
      else if (layer === 'pasture') color.copy(PASTURE_LOW).lerp(PASTURE_HIGH, (pastureFactor(seed, i) - PASTURE_MIN) / PASTURE_SPAN);
      else color.copy(RATING[CROPS[crop].kind === 'greenhouse' ? 'neutral' : cropRating(seed, tile, i, crop)]);
      const [x, z] = indexToWorld(i);
      m.makeTranslation(x, Y, z);
      mesh.setMatrixAt(count, m);
      mesh.setColorAt(count, color);
      count++;
    });
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();

    let plots = 0;
    for (const plot of reach) {
      if (known.has(plot)) continue;
      const { plotX, plotY } = plotCoords(plot);
      m.makeTranslation(plotX * PLOT_SIZE + PLOT_SIZE / 2 - HALF, Y + 0.002, plotY * PLOT_SIZE + PLOT_SIZE / 2 - HALF);
      hatchMesh.setMatrixAt(plots, m);
      plots++;
    }
    hatchMesh.count = plots;
    hatchMesh.instanceMatrix.needsUpdate = true;
    hatchMesh.computeBoundingSphere();
  }, [tiles, seed, surveyed, unlocked, layer, crop]);

  return (
    <group>
      <instancedMesh ref={tilesRef} args={[tileGeometry, tileMaterial, TILE_COUNT]} raycast={noRaycast} renderOrder={3} />
      <instancedMesh ref={hatchRef} args={[plotGeometry, hatchMaterial, PLOT_COUNT]} raycast={noRaycast} renderOrder={4} />
    </group>
  );
}
