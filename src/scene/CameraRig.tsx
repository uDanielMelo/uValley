import { PerspectiveCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Fog, MathUtils, Vector3, type PerspectiveCamera as PerspCam } from 'three';
import { CAMERA } from '../data/camera';
import { START_STRUCTURES, STRUCTURES } from '../data/structures';
import { GRID_SIZE } from '../data/world';
import { useGameStore } from '../store/gameStore';
import { refreshCursor, setDragCursor } from './cursor';
import { drive } from './drive';

const BUTTON_LEFT = 0;
const BUTTON_MIDDLE = 1;
const BUTTON_RIGHT = 2;
const LIMIT = GRID_SIZE / 2 + 2;
const DEG = MathUtils.DEG2RAD;
const MIN_EL = CAMERA.minElevationDeg * DEG;
const MAX_EL = CAMERA.maxElevationDeg * DEG;
const ROTATE_KEYS: Record<string, number> = { z: 1, x: -1, arrowleft: 1, arrowright: -1 };

interface Orbit {
  target: Vector3;
  azimuth: number;
  elevation: number;
  distance: number;
}

/** Where the camera starts: over the house, a little toward the fields behind it. */
const startTarget = (): Vector3 => {
  const house = START_STRUCTURES.find((p) => p.id === 'house');
  if (!house) return new Vector3();
  const def = STRUCTURES.house;
  return new Vector3(
    house.x + def.width / 2 - GRID_SIZE / 2,
    0,
    house.y + def.depth / 2 - GRID_SIZE / 2 - CAMERA.startNorthOffset,
  );
};

const initialOrbit = (): Orbit => ({
  target: startTarget(),
  azimuth: CAMERA.azimuthDeg * DEG,
  elevation: CAMERA.elevationDeg * DEG,
  distance: CAMERA.initialDistance,
});

type DragMode = 'pan' | 'rotate' | null;

/** With the hand (no order tool, not building) the left button drags the camera too. */
const handMode = (): boolean => {
  const { tool, buildMode } = useGameStore.getState();
  return tool === null && buildMode === null;
};

/**
 * Orbiting perspective camera. Right drag (or left drag with the hand) pans, middle drag (or
 * Shift + right drag) rotates and tilts, wheel zooms, Z/X or arrow keys rotate, optional edge panning.
 * Input goes to refs via DOM listeners and the camera eases toward the goal: no React re-renders.
 */
export function CameraRig() {
  const cameraRef = useRef<PerspCam>(null);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  /** Where input wants the camera to be. */
  const goal = useRef<Orbit>(initialOrbit());
  /** Smoothed values actually rendered. */
  const current = useRef<Orbit>(initialOrbit());
  const pointer = useRef({ x: 0, y: 0, inside: false, drag: null as DragMode, button: -1 });
  const keys = useRef(new Set<string>());
  const panRef = useRef<((dx: number, dy: number, viewHeight: number) => void) | null>(null);
  /** Elevation to restore when leaving the blueprint (top) view of the build mode. */
  const beforeBlueprint = useRef<number | null>(null);
  /** Whether a drive was being followed last frame (to zoom in once when it starts). */
  const driving = useRef(false);
  /** Id of the last camera focus request already followed. */
  const focused = useRef(useGameStore.getState().cameraFocus?.id ?? 0);

  useEffect(() => {
    const el = gl.domElement;
    /** Pans by screen pixels, scaled so the ground under the cursor follows it. */
    const pan = (dx: number, dy: number, viewHeight: number) => {
      const g = goal.current;
      const worldPerPixel = (2 * g.distance * Math.tan((CAMERA.fov * DEG) / 2)) / Math.max(viewHeight, 1);
      // Camera-relative ground axes for the current azimuth.
      const fx = -Math.sin(g.azimuth);
      const fz = -Math.cos(g.azimuth);
      const rx = -fz;
      const rz = fx;
      const forwardScale = 1 / Math.max(Math.sin(g.elevation), 0.3);
      g.target.x += (-dx * rx + dy * fx * forwardScale) * worldPerPixel;
      g.target.z += (-dx * rz + dy * fz * forwardScale) * worldPerPixel;
      g.target.x = MathUtils.clamp(g.target.x, -LIMIT, LIMIT);
      g.target.z = MathUtils.clamp(g.target.z, -LIMIT, LIMIT);
    };
    const rotate = (dx: number, dy: number) => {
      const g = goal.current;
      const speed = CAMERA.rotateSpeedDeg * DEG;
      g.azimuth -= dx * speed;
      g.elevation = MathUtils.clamp(g.elevation + dy * speed, MIN_EL, MAX_EL);
    };
    let last = { x: 0, y: 0 };

    const onDown = (e: PointerEvent) => {
      const mode: DragMode =
        e.button === BUTTON_MIDDLE || (e.button === BUTTON_RIGHT && e.shiftKey)
          ? 'rotate'
          : e.button === BUTTON_RIGHT || (e.button === BUTTON_LEFT && handMode())
            ? 'pan'
            : null;
      if (!mode) return;
      // The left button keeps its click (selection) and must not lose the event to capture.
      if (e.button !== BUTTON_LEFT) e.preventDefault();
      pointer.current.drag = mode;
      pointer.current.button = e.button;
      last = { x: e.clientX, y: e.clientY };
      if (e.button !== BUTTON_LEFT) el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      pointer.current.x = e.clientX;
      pointer.current.y = e.clientY;
      pointer.current.inside = e.target === el;
      const mode = pointer.current.drag;
      if (!mode) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      if (mode === 'rotate') rotate(dx, dy);
      else pan(dx, dy, el.clientHeight);
      if (pointer.current.button === BUTTON_LEFT && (dx !== 0 || dy !== 0)) setDragCursor(true);
    };
    const onUp = (e: PointerEvent) => {
      if (!pointer.current.drag || e.button !== pointer.current.button) return;
      pointer.current.drag = null;
      pointer.current.button = -1;
      setDragCursor(false);
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const g = goal.current;
      g.distance = MathUtils.clamp(
        g.distance * Math.exp(e.deltaY * CAMERA.zoomSensitivity),
        CAMERA.minDistance,
        CAMERA.maxDistance,
      );
    };
    const isTyping = (e: KeyboardEvent) =>
      e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
      const key = e.key.toLowerCase();
      if (key in ROTATE_KEYS) keys.current.add(key);
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const onBlur = () => keys.current.clear();
    const prevent = (e: Event) => e.preventDefault();
    const onLeaveWindow = () => {
      pointer.current.inside = false;
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', prevent);
    el.addEventListener('mousedown', prevent); // blocks middle-click autoscroll
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('mouseleave', onLeaveWindow);
    panRef.current = pan;
    refreshCursor();
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', prevent);
      el.removeEventListener('mousedown', prevent);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('mouseleave', onLeaveWindow);
    };
  }, [gl]);

  useFrame((state, delta) => {
    const cam = cameraRef.current;
    if (!cam) return;
    const dt = Math.min(delta, 0.1);
    const g = goal.current;
    const c = current.current;

    const p = pointer.current;
    if (useGameStore.getState().settings.edgePan && p.inside && !p.drag && panRef.current) {
      const { width, height } = state.size;
      const m = CAMERA.edgePanMargin;
      const dirX = p.x < m ? -1 : p.x > width - m ? 1 : 0;
      const dirY = p.y < m ? -1 : p.y > height - m ? 1 : 0;
      const step = CAMERA.edgePanSpeed * dt;
      if (dirX || dirY) panRef.current(-dirX * step, -dirY * step, height);
    }

    // Building: tilt to a top view (a floor plan); back to the previous tilt afterwards.
    const { buildMode, panel } = useGameStore.getState();
    const building = buildMode !== null || panel === 'build';
    if (building && beforeBlueprint.current === null) {
      beforeBlueprint.current = g.elevation;
      g.elevation = CAMERA.blueprintElevationDeg * DEG;
    } else if (!building && beforeBlueprint.current !== null) {
      g.elevation = beforeBlueprint.current;
      beforeBlueprint.current = null;
    }

    // Driving a machine: follow it, and swing behind it while it goes forward.
    const ride = drive.ride;
    if (ride) {
      if (!driving.current) g.distance = Math.min(g.distance, CAMERA.driveDistance);
      g.target.set(ride.x - GRID_SIZE / 2, 0, ride.y - GRID_SIZE / 2);
      if (ride.speed > 1) {
        const behind = ride.heading + Math.PI - g.azimuth;
        g.azimuth += Math.atan2(Math.sin(behind), Math.cos(behind)) * Math.min(1, dt * CAMERA.driveChaseRate);
      }
    }
    driving.current = ride !== null;

    // Sent to a spot (dev tools): center it and come closer.
    const focus = useGameStore.getState().cameraFocus;
    if (focus && focus.id !== focused.current) {
      focused.current = focus.id;
      g.target.set(focus.x - GRID_SIZE / 2, 0, focus.y - GRID_SIZE / 2);
      g.distance = focus.distance ?? Math.min(g.distance, CAMERA.focusDistance);
    }

    let keyDir = 0;
    for (const key of keys.current) keyDir += ROTATE_KEYS[key] ?? 0;
    if (keyDir) g.azimuth += keyDir * CAMERA.keyRotateSpeedDeg * DEG * dt;

    const t = 1 - Math.exp(-CAMERA.damping * dt);
    c.target.lerp(g.target, t);
    c.azimuth = MathUtils.lerp(c.azimuth, g.azimuth, t);
    c.elevation = MathUtils.lerp(c.elevation, g.elevation, t);
    c.distance = MathUtils.lerp(c.distance, g.distance, t);

    const horizontal = Math.cos(c.elevation) * c.distance;
    cam.position.set(
      c.target.x + Math.sin(c.azimuth) * horizontal,
      c.target.y + Math.sin(c.elevation) * c.distance,
      c.target.z + Math.cos(c.azimuth) * horizontal,
    );
    cam.lookAt(c.target);

    // Fog follows the zoom so the ground's far edge always fades into the sky.
    if (scene.fog instanceof Fog) {
      scene.fog.near = c.distance + CAMERA.fogStartOffset;
      scene.fog.far = scene.fog.near + CAMERA.fogRange;
    }
  });

  return <PerspectiveCamera ref={cameraRef} makeDefault fov={CAMERA.fov} near={0.1} far={400} />;
}
