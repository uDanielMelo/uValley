import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore';

/** Max real seconds simulated per frame (avoids huge jumps after tab switches). */
const MAX_FRAME_SECONDS = 0.25;

/** Drives the game clock from the render loop. Renders nothing. */
export function GameLoop() {
  useFrame((_, delta) => {
    useGameStore.getState().advance(Math.min(delta, MAX_FRAME_SECONDS));
  });
  return null;
}
