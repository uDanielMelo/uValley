/**
 * Live state of the player's drive (WASD): the pedals held down and the machine's pose. Kept out
 * of the store because it changes every frame; the store only knows which machine is driven.
 */
import type { Ride } from '../game/joyride';

export const drive: { ride: (Ride & { machineId: number }) | null; keys: Set<string> } = {
  ride: null,
  keys: new Set(),
};

export const DRIVE_KEYS = ['w', 'a', 's', 'd'] as const;

/** Throttle and steer from the keys held: W forward, S brake and reverse, A left, D right. */
export const driveInput = (): { throttle: number; steer: number } => {
  const k = drive.keys;
  return { throttle: (k.has('w') ? 1 : 0) - (k.has('s') ? 1 : 0), steer: (k.has('a') ? 1 : 0) - (k.has('d') ? 1 : 0) };
};
