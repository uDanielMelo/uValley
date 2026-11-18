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
    <div className="px-3 text-lg">
      <Coins value={formatCoins(money)} />
    </div>
  );
}

function Clock() {
  // Re-renders only when the displayed minute bucket changes (every 10 game minutes).
  const bucket = useGameStore((s) => Math.floor(s.game.gameMinutes / 10));
  const minutes = bucket * 10;
  const clock = toClock(minutes);
  const isDay = daylight(minutes) > 0.5;
  return (
    <div className="flex items-center gap-1.5 border-l-2 border-wood/20 px-3 text-base font-black tabular-nums">
      <span aria-hidden>{isDay ? '☀️' : '🌙'}</span>
      <span>Dia {clock.day}</span>
      <span className="text-wood/50">·</span>
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
          className={`min-w-8 rounded-md px-1.5 py-0.5 text-xs font-black ${
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
      <IconButton icon="☰" label="Menu" onClick={() => setOpen((v) => !v)} expanded={open} />
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

interface IconButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  expanded?: boolean;
  /** Small text after the icon (e.g. a count). */
  badge?: string;
}

/** Square icon button for the top bar; the label shows as a tooltip. */
function IconButton({ icon, label, onClick, active = false, expanded, badge }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-expanded={expanded}
      className={`flex h-10 min-w-10 items-center justify-center gap-1 rounded-xl px-2 text-lg font-black transition ${
        active ? 'bg-coin/50 ring-2 ring-wood/60' : 'hover:bg-parchment-dark'
      }`}
    >
      <span aria-hidden>{icon}</span>
      {badge && <span className="text-xs tabular-nums">{badge}</span>}
    </button>
  );
}

function PanelButtons() {
  const panel = useGameStore((s) => s.panel);
  const workers = useGameStore((s) => s.game.workers.length);
  const tasks = useGameStore((s) => s.game.tasks.length);
  const openPanel = useGameStore((s) => s.openPanel);
  return (
    <>
      <IconButton
        icon="👨‍🌾"
        label={`Equipe (T): ${workers} trabalhadores, ${tasks} tarefas na fila`}
        badge={`${workers} · 📋${tasks}`}
        active={panel === 'workers'}
        onClick={() => openPanel('workers')}
      />
      <IconButton icon="🛒" label="Loja (L)" active={panel === 'shop'} onClick={() => openPanel('shop')} />
      <IconButton icon="🎒" label="Inventário (I)" active={panel === 'inventory'} onClick={() => openPanel('inventory')} />
    </>
  );
}

/** Minimal top bar: money, day and speed on the left; panels and menu as icons on the right. */
export function TopBar() {
  return (
    <div className="flex items-start justify-between gap-3 p-3">
      <Card className="flex items-center py-1 pr-1">
        <Money />
        <Clock />
        <SpeedControls />
      </Card>
      <Card className="flex items-center gap-0.5 p-1">
        <PanelButtons />
        <span className="mx-0.5 h-6 w-px bg-wood/20" aria-hidden />
        <GameMenu />
      </Card>
    </div>
  );
}
