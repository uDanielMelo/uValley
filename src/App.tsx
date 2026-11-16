import { GameCanvas } from './scene/GameCanvas';
import { Hud } from './ui/Hud';

export function App() {
  return (
    <div className="relative h-full w-full font-sans">
      <GameCanvas />
      <Hud />
    </div>
  );
}
