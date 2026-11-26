import { useFrame } from '@react-three/fiber';
import { useEffect } from 'react';
import { MACHINES } from '../data/machines';
import { machinePose } from '../game/machines';
import { ownBayTiles, stepRide } from '../game/joyride';
import { useGameStore } from '../store/gameStore';
import { DRIVE_KEYS, drive, driveInput } from './drive';

const isDriveKey = (k: string): k is (typeof DRIVE_KEYS)[number] => DRIVE_KEYS.some((d) => d === k);

/**
 * The player's drive: reads WASD and moves the driven machine each frame (no effect on the farm).
 * Mounted before the machines so they draw this frame's pose.
 */
export function DriveControls() {
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      if (useGameStore.getState().joyride !== null && isDriveKey(key)) {
        drive.keys.add(key);
        e.preventDefault();
      }
    };
    const onUp = (e: KeyboardEvent) => drive.keys.delete(e.key.toLowerCase());
    const onBlur = () => drive.keys.clear();
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      drive.ride = null;
    };
  }, []);

  useFrame((_, delta) => {
    const { joyride, game, stopJoyride } = useGameStore.getState();
    if (joyride === null) {
      drive.ride = null;
      return;
    }
    const machine = game.machines.find((m) => m.id === joyride);
    if (!machine) {
      stopJoyride('A máquina não está mais na fazenda.');
      return;
    }
    if (machine.driverId !== undefined) {
      const name = game.workers.find((w) => w.id === machine.driverId)?.name ?? 'Um operador';
      stopJoyride(`${name} pegou ${MACHINES[machine.type].label.toLowerCase()} para trabalhar.`);
      return;
    }
    if (!drive.ride || drive.ride.machineId !== machine.id) {
      const pose = machinePose(game, machine);
      if (!pose) {
        stopJoyride();
        return;
      }
      drive.keys.clear();
      drive.ride = { machineId: machine.id, x: pose.x, y: pose.y, heading: ((pose.heading ?? 0) * Math.PI) / 2, speed: 0 };
    }
    const dt = Math.min(delta, 0.05);
    const own = ownBayTiles(game.structures, machine);
    drive.ride = { ...stepRide(machine.type, drive.ride, driveInput(), dt, game.tiles, own), machineId: machine.id };
  });
  return null;
}
