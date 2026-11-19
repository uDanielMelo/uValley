import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Color, Fog, MathUtils, Vector3, type AmbientLight, type DirectionalLight, type HemisphereLight } from 'three';
import { SEASONS, WEATHERS } from '../data/climate';
import { dayOf, seasonOf, weatherAt } from '../game/climate';
import { dayFraction, daylight } from '../game/time';
import { useGameStore } from '../store/gameStore';
import { LAMP_MATERIAL, WINDOW_MATERIAL, nightState } from './materials';
import { SEASON_TINTS, paintSeasonal, seasonTint } from './season';
import { skyUniforms } from './Sky';

// Sky palette: [top, horizon] for day, golden hour and night.
const DAY_TOP = new Color('#4f9be0');
const DAY_HORIZON = new Color('#cde4ee');
const DUSK_TOP = new Color('#506aa8');
const DUSK_HORIZON = new Color('#f2a66e');
const NIGHT_TOP = new Color('#070b1c');
const NIGHT_HORIZON = new Color('#22335c');

const SUN_HIGH = new Color('#fff3dc');
const SUN_LOW = new Color('#ff9d52');
const MOON = new Color('#8fa8e8');
const HEMI_GROUND_DAY = new Color('#6b7a3a');
const WARM_WHITE = new Color('#fff6e8');
const HEMI_GROUND_NIGHT = new Color('#24304a');
/** Sky colors of a fully overcast day. */
const GRAY_TOP = new Color('#7f8b96');
const GRAY_HORIZON = new Color('#b4bcc3');

/** Hours of sunrise and sunset; the sun follows an arc between them. */
const SUNRISE = 5;
const SUNSET = 19.5;
/** Sun tilt toward +z so shadows fall away from the default camera. */
const SUN_TILT = 0.45;
const MOON_DIR = new Vector3(-0.5, 0.8, 0.35).normalize();
const LIGHT_DISTANCE = 60;
const SHADOW_EXTENT = 40;

const tmpColor = new Color();
const sunDir = new Vector3();
const lightDir = new Vector3();
const shadowDir = new Vector3();
/** Eased weather, so the sky changes smoothly at midnight. */
const weather = { overcast: 0, flash: 0, nextFlash: 0 };

/**
 * Sun/moon, sky dome, fog and night lights driven by the game clock.
 * Everything is read per frame from the store: no re-renders.
 */
export function DayNightLight() {
  const sun = useRef<DirectionalLight>(null);
  const ambient = useRef<AmbientLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const scene = useThree((s) => s.scene);
  const graphics = useGameStore((s) => s.settings.graphics);

  // Sharper shadows on high quality; the shadow map is rebuilt on change.
  useEffect(() => {
    const light = sun.current;
    if (!light) return;
    const size = graphics === 'high' ? 4096 : 2048;
    light.shadow.mapSize.set(size, size);
    light.shadow.map?.dispose();
    light.shadow.map = null;
  }, [graphics]);

  useEffect(() => {
    scene.fog = new Fog(DAY_HORIZON.clone(), 60, 130);
    return () => {
      scene.fog = null;
    };
  }, [scene]);

  useFrame(() => {
    const minutes = useGameStore.getState().game.gameMinutes;
    const light = daylight(minutes);
    const today = WEATHERS[weatherAt(minutes)];
    weather.overcast = MathUtils.lerp(weather.overcast, today.overcast, 0.02);
    const overcast = weather.overcast;
    // Lightning in storms: short random flashes.
    const now = performance.now() / 1000;
    if (today.id === 'storm' && now > weather.nextFlash) {
      weather.flash = 1;
      weather.nextFlash = now + 2 + Math.random() * 6;
    }
    weather.flash *= 0.86;
    // The landscape follows the season.
    seasonTint.lerp(SEASON_TINTS[SEASONS[seasonOf(dayOf(minutes))].id], 0.02);
    paintSeasonal();
    const hour = dayFraction(minutes) * 24;

    // Sun arc: 0 at sunrise, PI at sunset.
    const arc = ((hour - SUNRISE) / (SUNSET - SUNRISE)) * Math.PI;
    const elevation = Math.sin(arc);
    sunDir.set(-Math.cos(arc), elevation, SUN_TILT).normalize();
    // Golden hour: strongest when the sun is low but still lighting the scene.
    const golden = light > 0 ? 1 - MathUtils.smoothstep(elevation, 0.05, 0.45) : 0;
    const night = 1 - light;
    nightState.value = night;

    // Key light: the sun by day, the moon by night (same shadow-casting light).
    const s = sun.current;
    if (s) {
      const sunWeight = MathUtils.smoothstep(light, 0.05, 0.35);
      // Never let shadows get infinitely long near the horizon.
      shadowDir.copy(sunDir);
      shadowDir.y = Math.max(shadowDir.y, 0.22);
      lightDir.copy(MOON_DIR).lerp(shadowDir.normalize(), sunWeight).normalize();
      // The target stays at the origin (default), so the shadow frustum covers the whole farm.
      s.position.copy(lightDir).multiplyScalar(LIGHT_DISTANCE);
      s.intensity = MathUtils.lerp(0.7, 3.1, sunWeight) * (1 - golden * 0.12) * (1 - overcast * 0.8);
      tmpColor.copy(SUN_HIGH).lerp(SUN_LOW, golden);
      s.color.copy(MOON).lerp(tmpColor, sunWeight);
    }

    // Sky colors.
    const top = skyUniforms.uTop.value;
    const horizon = skyUniforms.uHorizon.value;
    top.copy(NIGHT_TOP).lerp(DAY_TOP, light).lerp(DUSK_TOP, golden * 0.6);
    horizon.copy(NIGHT_HORIZON).lerp(DAY_HORIZON, light).lerp(DUSK_HORIZON, golden * 0.85);
    // Clouds gray the sky by day (and darken the night a little).
    top.lerp(GRAY_TOP, overcast * light * 0.85).multiplyScalar(1 - overcast * (1 - light) * 0.3);
    horizon.lerp(GRAY_HORIZON, overcast * light * 0.8).multiplyScalar(1 - overcast * (1 - light) * 0.3);
    skyUniforms.uSunDir.value.copy(sunDir);
    skyUniforms.uSunColor.value.copy(SUN_HIGH).lerp(SUN_LOW, golden);
    skyUniforms.uSunGlow.value = MathUtils.smoothstep(elevation, -0.08, 0.05) * (1 - overcast);
    skyUniforms.uStars.value = MathUtils.smoothstep(night, 0.6, 1) * (1 - overcast);
    if (scene.fog instanceof Fog) scene.fog.color.copy(horizon);

    if (hemi.current) {
      // Sky fill, warmed toward white so light walls don't turn blue.
      hemi.current.color.copy(top).lerp(horizon, 0.5).lerp(WARM_WHITE, 0.45 * light);
      hemi.current.groundColor.copy(HEMI_GROUND_NIGHT).lerp(HEMI_GROUND_DAY, light);
      hemi.current.intensity = (MathUtils.lerp(0.6, 1.1, light) + golden * 0.25) * (1 - overcast * 0.3);
    }
    if (ambient.current) ambient.current.intensity = MathUtils.lerp(0.12, 0.25, light) + overcast * 0.12 + weather.flash * 2.5;

    const lamps = MathUtils.smoothstep(night, 0.35, 0.8);
    WINDOW_MATERIAL.emissiveIntensity = lamps * 3.5;
    LAMP_MATERIAL.emissiveIntensity = lamps * 6;
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.2} color="#c9d8ff" />
      <hemisphereLight ref={hemi} args={['#cfe6f2', '#6b7a3a', 1]} />
      <directionalLight
        ref={sun}
        castShadow
        position={[20, 40, 18]}
        intensity={3}
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={3}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={1}
        shadow-camera-far={140}
      />
    </>
  );
}
