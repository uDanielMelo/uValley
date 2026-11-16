import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';

const TOAST_MS = 2200;

export function Toast() {
  const toast = useGameStore((s) => s.toast);
  const [visibleId, setVisibleId] = useState<number | null>(null);

  useEffect(() => {
    if (!toast) return;
    setVisibleId(toast.id);
    const timer = window.setTimeout(() => setVisibleId(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast || visibleId !== toast.id) return null;
  return (
    <div
      role="status"
      className={`rounded-full px-5 py-2 font-extrabold shadow-lg ${
        toast.kind === 'error' ? 'bg-red-700 text-white' : 'bg-leaf text-white'
      }`}
    >
      {toast.text}
    </div>
  );
}
