import { useState } from 'react';
import { SPEED_OPTIONS, type GameSpeed } from '../data/world';
import { daylight, formatClock, toClock } from '../game/time';
import { useGameStore } from '../store/gameStore';
import { formatCoins } from './format';
import { Button, Card, Coins } from './primitives';

const SPEED_LABELS: Record<GameSpeed, string> = { 0: '⏸', 1: '1×', 2: '2×', 3: '3×' };

function Money() {
  const money = useGameStore((s) => s.game.money);
  return (
    <Card className="px-4 py-2 text-xl">
      <Coins value={formatCoins(money)} />
    </Card>
  );
}

function Clock() {
  // Re-renders only when the displayed minute bucket changes (every 10 game minutes).
  const bucket = useGameStore((s) => Math.floor(s.game.gameMinutes / 10));
  const minutes = bucket * 10;
  const clock = toClock(minutes);
  const isDay = daylight(minutes) > 0.5;
  return (
    <div className="flex items-center gap-2 px-3 text-lg font-black tabular-nums">
      <span aria-hidden>{isDay ? '☀️' : '🌙'}</span>
      <span>Dia {clock.day}</span>
      <span className="text-wood/70">·</span>
      <span>{formatClock(clock)}</span>
    </div>
  );
}

function SpeedControls() {
  const speed = useGameStore((s) => s.settings.speed);
  const setSpeed = useGameStore((s) => s.setSpeed);
  return (
    <div className="flex gap-1 border-l-2 border-wood/20 pl-2">
      {SPEED_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setSpeed(option)}
          title={option === 0 ? 'Pausar (Espaço)' : `Velocidade ${option}×`}
          className={`min-w-9 rounded-md px-2 py-1 text-sm font-black ${
            speed === option ? 'bg-wood text-parchment' : 'hover:bg-parchment-dark'
          }`}
        >
          {SPEED_LABELS[option]}
        </button>
      ))}
    </div>
  );
}

function GameMenu() {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const edgePan = useGameStore((s) => s.settings.edgePan);
  const setEdgePan = useGameStore((s) => s.setEdgePan);
  const save = useGameStore((s) => s.save);
  const newGame = useGameStore((s) => s.newGame);
  const lastSavedAt = useGameStore((s) => s.lastSavedAt);

  return (
    <div className="relative">
      <Button variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        ☰ Menu
      </Button>
      {open && (
        <Card className="absolute top-full right-0 mt-2 flex w-64 flex-col gap-2 p-3 text-sm">
          <label className="flex cursor-pointer items-center justify-between gap-2 font-bold">
            Mover câmera pelas bordas
            <input
              type="checkbox"
              checked={edgePan}
              onChange={(e) => setEdgePan(e.target.checked)}
              className="h-4 w-4 accent-wood"
            />
          </label>
          <GraphicsToggle />
          <Button variant="ghost" onClick={save}>
            💾 Salvar agora
          </Button>
          <p className="text-center text-xs text-wood/70">
            {lastSavedAt
              ? `Salvo às ${new Date(lastSavedAt).toLocaleTimeString('pt-BR')}`
              : 'Salvamento automático a cada 30 s'}
          </p>
          {confirming ? (
            <div className="flex flex-col gap-2 rounded-lg bg-red-100 p-2">
              <p className="text-center font-bold text-red-900">Apagar o progresso atual?</p>
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => setConfirming(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={() => {
                    newGame();
                    setConfirming(false);
                    setOpen(false);
                  }}
                >
                  Apagar
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirming(true)}>
              Novo jogo
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}

function GraphicsToggle() {
  const graphics = useGameStore((s) => s.settings.graphics);
  const setGraphics = useGameStore((s) => s.setGraphics);
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 font-bold">
      Gráficos em alta qualidade
      <input
        type="checkbox"
        checked={graphics === 'high'}
        onChange={(e) => setGraphics(e.target.checked ? 'high' : 'low')}
        className="h-4 w-4 accent-wood"
      />
    </label>
  );
}

function WorkersButton() {
  const workers = useGameStore((s) => s.game.workers.length);
  const tasks = useGameStore((s) => s.game.tasks.length);
  const openPanel = useGameStore((s) => s.openPanel);
  return (
    <Button variant="ghost" onClick={() => openPanel('workers')} title="Trabalhadores (T)">
      👨‍🌾 {workers}
      <span className="ml-2 rounded bg-wood/15 px-1.5 text-sm tabular-nums" title="Tarefas na fila">
        📋 {tasks}
      </span>
    </Button>
  );
}

export function TopBar() {
  const openPanel = useGameStore((s) => s.openPanel);
  return (
    <div className="flex items-start justify-between gap-3 p-3">
      <div className="flex items-center gap-3">
        <Money />
        <Card className="flex items-center py-1 pr-1">
          <Clock />
          <SpeedControls />
        </Card>
      </div>
      <div className="pointer-events-auto flex gap-2">
        <WorkersButton />
        <Button variant="leaf" onClick={() => openPanel('shop')} title="Loja (L)">
          🛒 Loja
        </Button>
        <Button onClick={() => openPanel('inventory')} title="Inventário (I)">
          🎒 Inventário
        </Button>
        <GameMenu />
      </div>
    </div>
  );
}
