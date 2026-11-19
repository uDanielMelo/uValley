import { useEffect, useState, type ReactNode } from 'react';
import { ANIMALS, ANIMAL_IDS } from '../data/animals';
import { useGameStore } from '../store/gameStore';
import { devCommands as dev } from './devTools';
import { Card } from './primitives';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-[11px] font-black tracking-wide text-emerald-300 uppercase">{title}</h3>
      <div className="flex flex-wrap gap-1">{children}</div>
    </section>
  );
}

function DevButton({ onClick, children, title }: { onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded-md bg-white/10 px-2 py-1 text-xs font-bold text-white hover:bg-white/25 active:bg-white/35"
    >
      {children}
    </button>
  );
}

const HOURS = [0, 6, 9, 12, 15, 18, 19.5, 22] as const;
const SCALES = [1, 5, 20, 60] as const;

const hourLabel = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;

/** Testing cheats. Only mounted when DEV_ENABLED; toggled with F2. */
export function DevPanel() {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('1000');
  const [count, setCount] = useState(1);
  const scale = useGameStore((s) => s.devTimeScale);
  const animals = useGameStore((s) => s.game.animals.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ferramentas de dev (F2)"
        className="pointer-events-auto absolute top-20 left-3 rounded-lg bg-slate-900/80 px-2 py-1 text-sm font-black text-emerald-300 shadow hover:bg-slate-900"
      >
        🛠️ Dev
      </button>
    );
  }

  const value = Number(amount) || 0;
  return (
    <div className="pointer-events-none absolute top-20 left-3 z-10">
      <Card className="flex max-h-[calc(100vh-12rem)] w-72 flex-col overflow-hidden border-emerald-400/40 bg-slate-900/90! text-white!">
        <header className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <h2 className="font-black text-emerald-300">🛠️ Modo dev</h2>
          <button type="button" onClick={() => setOpen(false)} className="px-1 text-lg font-black" aria-label="Fechar">
            ×
          </button>
        </header>
        <div className="flex flex-col gap-3 overflow-y-auto p-3">
          <Section title="Dinheiro">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d-]/g, ''))}
              className="w-20 rounded-md bg-white/10 px-2 py-1 text-xs font-bold text-white outline-none"
              inputMode="numeric"
            />
            <DevButton onClick={() => dev.money(value)}>+ somar</DevButton>
            <DevButton onClick={() => dev.setMoney(value)}>= definir</DevButton>
            <DevButton onClick={() => dev.money(10_000)}>+10k</DevButton>
          </Section>

          <Section title="Hora do dia">
            {HOURS.map((h) => (
              <DevButton key={h} onClick={() => dev.time(h)}>
                {hourLabel(h)}
              </DevButton>
            ))}
          </Section>

          <Section title="Pular tempo (simulando)">
            <DevButton onClick={() => dev.skip(1)}>+1 h</DevButton>
            <DevButton onClick={() => dev.skip(6)}>+6 h</DevButton>
            <DevButton onClick={() => dev.days(1)}>+1 dia</DevButton>
            <DevButton onClick={() => dev.days(7)}>+7 dias</DevButton>
          </Section>

          <Section title={`Velocidade extra (agora ×${scale})`}>
            {SCALES.map((s) => (
              <DevButton key={s} onClick={() => dev.speed(s)}>
                ×{s}
              </DevButton>
            ))}
          </Section>

          <Section title="Inventário">
            <DevButton onClick={() => dev.seeds(10)}>+10 sementes</DevButton>
            <DevButton onClick={() => dev.produce(10)}>+10 produtos</DevButton>
          </Section>

          <Section title="Lavoura">
            <DevButton onClick={dev.water}>💧 Regar tudo</DevButton>
            <DevButton onClick={dev.grow}>🌾 Crescer tudo</DevButton>
            <DevButton onClick={dev.finish}>✅ Concluir fila</DevButton>
          </Section>

          <Section title="Fazenda">
            <DevButton onClick={dev.unlock}>🔓 Liberar lotes</DevButton>
            <DevButton onClick={dev.build}>🔨 Concluir obras</DevButton>
            <DevButton onClick={() => dev.hire(1)}>👨‍🌾 +1 trabalhador</DevButton>
          </Section>

          <Section title={`Animais (${animals}) · criar`}>
            <div className="flex w-full items-center gap-1 pb-1 text-xs font-bold">
              Quantidade
              {[1, 3, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={`rounded px-2 ${count === n ? 'bg-emerald-500 text-slate-900' : 'bg-white/10'}`}
                >
                  {n}
                </button>
              ))}
            </div>
            {ANIMAL_IDS.map((kind) => (
              <DevButton key={kind} onClick={() => dev.spawn(kind, count)} title={ANIMALS[kind].label}>
                {ANIMALS[kind].icon} {ANIMALS[kind].label}
              </DevButton>
            ))}
            <DevButton onClick={dev.products}>✨ Produtos prontos</DevButton>
            <DevButton onClick={() => dev.age(24)}>⏳ +24 h de idade</DevButton>
            <DevButton onClick={() => dev.sick('flu')}>🤧 Adoecer um</DevButton>
            <DevButton onClick={dev.heal}>💚 Curar todos</DevButton>
            <DevButton onClick={dev.attack}>🦊 Ataque</DevButton>
            <DevButton onClick={dev.preview} title="Mostra a animação do ataque sem ferir nenhum animal">
              🎬 Ver ataque
            </DevButton>
            <DevButton onClick={() => dev.medicine(5)}>💊 +5 remédios</DevButton>
            <DevButton onClick={() => dev.fertilizer(10)}>💩 +10 adubo</DevButton>
            <DevButton onClick={dev.manure}>🪣 Esterco cheio</DevButton>
          </Section>

          <p className="text-[11px] text-white/60">
            Também no console: <code className="text-emerald-300">dev.help()</code>
          </p>
        </div>
      </Card>
    </div>
  );
}
