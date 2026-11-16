import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'wood' | 'leaf' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  wood: 'bg-wood text-parchment hover:bg-wood-dark border-wood-dark',
  leaf: 'bg-leaf text-white hover:brightness-110 border-green-900/60',
  ghost: 'bg-parchment-dark/70 text-wood-dark hover:bg-parchment-dark border-wood/30',
  danger: 'bg-red-700 text-white hover:bg-red-800 border-red-950/60',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'wood', className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`rounded-lg border-b-4 px-3 py-1.5 font-extrabold transition active:translate-y-0.5 active:border-b-2 disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

/** Parchment card used by every HUD element. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`pointer-events-auto rounded-2xl border-2 border-wood/40 bg-parchment/95 text-wood-dark shadow-[0_6px_0_rgba(94,59,31,0.35)] backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}

interface PanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Panel({ title, onClose, children }: PanelProps) {
  return (
    <Card className="flex max-h-[70vh] w-[22rem] flex-col">
      <header className="flex items-center justify-between border-b-2 border-wood/20 px-4 py-2">
        <h2 className="text-lg font-black">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 text-xl font-black text-wood hover:bg-parchment-dark"
          aria-label="Fechar"
        >
          ×
        </button>
      </header>
      <div className="overflow-y-auto p-4">{children}</div>
    </Card>
  );
}

export function Coins({ value, className = '' }: { value: string | number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 font-black tabular-nums ${className}`}>
      <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-full border-2 border-amber-700 bg-coin" />
      {value}
    </span>
  );
}
