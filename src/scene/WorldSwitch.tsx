import type { ReactNode } from 'react';
import { useGameStore } from '../store/gameStore';
import { CityScene } from './city/CityScene';

/**
 * Shows the farm (its children) or the town. Only re-renders when the view changes; the farm is
 * unmounted in town (the game keeps running in the store) and rebuilt on the way back.
 */
export function WorldSwitch({ children }: { children: ReactNode }) {
  const view = useGameStore((s) => s.view);
  return view === 'city' ? <CityScene /> : <>{children}</>;
}
