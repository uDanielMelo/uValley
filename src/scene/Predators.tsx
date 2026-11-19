import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { MathUtils, MeshStandardMaterial, type BufferGeometry, type Group } from 'three';
import { PREDATORS, PREDATOR_FLEE_SECONDS, type PredatorId } from '../data/health';
import { GRID_SIZE } from '../data/world';
import { useGameStore, type PredatorSighting } from '../store/gameStore';
import { predatorGeometry } from './models/predatorModel';

const HALF = GRID_SIZE / 2;
/** How far past the map edge it runs before vanishing (tiles). */
const OFF_MAP = 6;
/** Share of the sighting spent standing over the spot before running. */
const LINGER = 0.25;
const MATERIAL = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });

const geometries = new Map<PredatorId, BufferGeometry>();
const geometryFor = (id: PredatorId): BufferGeometry => {
  let geometry = geometries.get(id);
  if (!geometry) {
    geometry = predatorGeometry(PREDATORS[id].color);
    geometries.set(id, geometry);
  }
  return geometry;
};

/** From the attack to the nearest map edge and a bit beyond, in world units. */
const fleeRoute = ({ x, y }: PredatorSighting): { from: [number, number]; to: [number, number] } => {
  const options: { distance: number; to: [number, number] }[] = [
    { distance: x, to: [-OFF_MAP, y] },
    { distance: GRID_SIZE - x, to: [GRID_SIZE + OFF_MAP, y] },
    { distance: y, to: [x, -OFF_MAP] },
    { distance: GRID_SIZE - y, to: [x, GRID_SIZE + OFF_MAP] },
  ];
  const nearest = options.reduce((best, o) => (o.distance < best.distance ? o : best));
  return { from: [x - HALF, y - HALF], to: [nearest.to[0] - HALF, nearest.to[1] - HALF] };
};

/** A predator running off after an attack, for a few real seconds. */
function Fleeing({ sighting }: { sighting: PredatorSighting }) {
  const root = useRef<Group>(null);
  const route = useMemo(() => fleeRoute(sighting), [sighting]);
  const heading = Math.atan2(route.to[0] - route.from[0], route.to[1] - route.from[1]);
  useFrame(() => {
    const r = root.current;
    if (!r) return;
    const t = (performance.now() / 1000 - sighting.at) / PREDATOR_FLEE_SECONDS;
    r.visible = t >= 0 && t < 1;
    if (!r.visible) return;
    // It stands over the spot for a moment, then runs off at a steady gallop.
    const running = Math.max(0, (t - LINGER) / (1 - LINGER));
    r.position.set(
      MathUtils.lerp(route.from[0], route.to[0], running),
      running > 0 ? Math.abs(Math.sin(t * 60)) * 0.03 : 0,
      MathUtils.lerp(route.from[1], route.to[1], running),
    );
  });
  return (
    <group ref={root} rotation={[0, heading, 0]} scale={PREDATORS[sighting.predator].scale} visible={false}>
      <mesh geometry={geometryFor(sighting.predator)} material={MATERIAL} castShadow />
    </group>
  );
}

/** Predators seen running away after recent attacks (scene only). */
export function Predators() {
  const sightings = useGameStore((s) => s.sightings);
  return (
    <group>
      {sightings.map((s) => (
        <Fleeing key={s.id} sighting={s} />
      ))}
    </group>
  );
}
