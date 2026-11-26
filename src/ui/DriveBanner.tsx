import { useEffect, useRef } from 'react';
import { MACHINES } from '../data/machines';
import { drive } from '../scene/drive';
import { useGameStore } from '../store/gameStore';
import { Button, Card } from './primitives';

/** Live speedometer: read from the drive each animation frame, written straight to the DOM. */
function Speed() {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      if (el.current) el.current.textContent = `${Math.round(Math.abs(drive.ride?.speed ?? 0) * 3.6)} km/h`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <span ref={el} className="w-16 text-right tabular-nums" />;
}

/** Shown while the player drives a machine: the controls, the speed and the way out. */
export function DriveBanner() {
  const type = useGameStore((s) => (s.joyride === null ? null : (s.game.machines.find((m) => m.id === s.joyride)?.type ?? null)));
  const stop = useGameStore((s) => s.stopJoyride);
  if (type === null) return null;
  const def = MACHINES[type];
  return (
    <Card className="flex items-center gap-3 px-4 py-2 text-sm font-extrabold">
      <span>
        {def.icon} Dirigindo {def.label.toLowerCase()} · <kbd>W</kbd> acelera · <kbd>S</kbd> freia e dá ré · <kbd>A</kbd>{' '}
        <kbd>D</kbd> vira
      </span>
      <Speed />
      <Button variant="ghost" className="text-xs" onClick={() => stop()}>
        Sair (Esc)
      </Button>
    </Card>
  );
}
