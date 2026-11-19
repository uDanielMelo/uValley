import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ANIMALS } from '../data/animals';
import { GITHUB_BONUS } from '../data/social';
import { communityBonus } from '../game/social';
import { isOutdatedSave, serialize } from '../game/save';
import { toClock } from '../game/time';
import {
  cloudConfig,
  currentSession,
  downloadSave,
  listProfiles,
  loginUrl,
  logout,
  uploadSave,
  type FarmProfile,
} from '../services/cloud';
import { saveLoadError, useGameStore } from '../store/gameStore';
import { formatCoins } from './format';
import { Button, Coins, Panel } from './primitives';

/** GitHub link: public activity becomes a capped bonus on growth and production. */
function GitHubSection() {
  const link = useGameStore((s) => s.game.github);
  const bonus = useGameStore((s) => Math.round((communityBonus(s.game) - 1) * 100));
  const sync = useGameStore((s) => s.syncGitHub);
  const unlink = useGameStore((s) => s.unlinkGitHub);
  const [login, setLogin] = useState(link?.login ?? '');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    await sync(login);
    setBusy(false);
  };
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-parchment-dark/60 p-3 text-xs font-bold">
      <h3 className="text-sm font-black">🐙 GitHub</h3>
      <p className="text-wood/80">
        Cada dia com contribuições públicas nos últimos {GITHUB_BONUS.windowDays} dias dá +
        {Math.round(GITHUB_BONUS.perActiveDay * 100)}% no crescimento das plantas e na produção dos animais, até{' '}
        {GITHUB_BONUS.maxDays} dias (+{Math.round(GITHUB_BONUS.perActiveDay * GITHUB_BONUS.maxDays * 100)}%). Conta o dia, não
        o número de commits.
      </p>
      <div className="flex gap-2">
        <input
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="seu usuário"
          aria-label="Usuário do GitHub"
          className="min-w-0 flex-1 rounded-lg border-2 border-wood/30 bg-parchment px-2 py-1 font-bold"
        />
        <Button className="text-xs" disabled={busy || !login.trim()} onClick={run}>
          {busy ? '…' : link ? 'Sincronizar' : 'Conectar'}
        </Button>
      </div>
      {link && (
        <div className="flex items-center justify-between">
          <span>
            {link.login}: {link.activeDays} dia(s) ativo(s) · <span className="text-leaf">+{bonus}%</span>
          </span>
          <Button variant="ghost" className="text-xs" onClick={unlink}>
            Desconectar
          </Button>
        </div>
      )}
    </section>
  );
}

/** Save to a file and load it back (to move the farm to another computer). */
function FileSection() {
  const loadSaveText = useGameStore((s) => s.loadSaveText);
  const showMessage = useGameStore((s) => s.showMessage);
  const input = useRef<HTMLInputElement>(null);
  const exportSave = () => {
    const { game, settings } = useGameStore.getState();
    const blob = new Blob([serialize(game, settings)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `uvalley-dia-${toClock(game.gameMinutes).day}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importSave = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const ok = loadSaveText(text);
    showMessage(ok ? 'Fazenda carregada do arquivo.' : saveLoadError(text), ok ? 'info' : 'error');
  };
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-parchment-dark/60 p-3 text-xs font-bold">
      <h3 className="text-sm font-black">💾 Save em arquivo</h3>
      <p className="text-wood/80">Leve a fazenda para outro navegador ou computador.</p>
      <div className="flex gap-2">
        <Button className="flex-1 text-xs" onClick={exportSave}>
          Exportar
        </Button>
        <Button variant="ghost" className="flex-1 text-xs" onClick={() => input.current?.click()}>
          Importar
        </Button>
        <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={importSave} />
      </div>
    </section>
  );
}

/** This farm's public card for the cloud. */
const farmProfile = (): FarmProfile => {
  const { game } = useGameStore.getState();
  return {
    name: game.github?.login ?? 'Fazenda sem nome',
    day: toClock(game.gameMinutes).day,
    money: Math.floor(game.money),
    animals: game.animals.length,
  };
};

/** Cloud save and other farms (only when Supabase is configured). */
function CloudSection() {
  const config = cloudConfig();
  const [session, setSession] = useState(() => currentSession());
  const [farms, setFarms] = useState<FarmProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const loadSaveText = useGameStore((s) => s.loadSaveText);
  const showMessage = useGameStore((s) => s.showMessage);
  useEffect(() => {
    if (config && session) void listProfiles(config, session).then(setFarms);
  }, [config, session]);
  if (!config) {
    return (
      <section className="rounded-xl border-2 border-dashed border-wood/25 p-3 text-xs font-bold text-wood/70">
        ☁️ Save na nuvem e fazendas de amigos: precisa configurar o servidor (Supabase). Veja docs/supabase.md.
      </section>
    );
  }
  const upload = async () => {
    if (!session) return;
    setBusy(true);
    const { game, settings } = useGameStore.getState();
    const ok = await uploadSave(config, session, serialize(game, settings), farmProfile());
    setBusy(false);
    showMessage(ok ? '☁️ Fazenda salva na nuvem.' : 'Não foi possível salvar na nuvem.', ok ? 'info' : 'error');
  };
  const download = async () => {
    if (!session) return;
    setBusy(true);
    const raw = await downloadSave(config, session);
    setBusy(false);
    const ok = raw !== null && loadSaveText(raw);
    const error = raw !== null && isOutdatedSave(raw) ? saveLoadError(raw) : 'Nenhum save válido na nuvem.';
    showMessage(ok ? '☁️ Fazenda carregada da nuvem.' : error, ok ? 'info' : 'error');
  };
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-parchment-dark/60 p-3 text-xs font-bold">
      <h3 className="text-sm font-black">☁️ Nuvem</h3>
      {!session ? (
        <Button className="text-xs" onClick={() => window.location.assign(loginUrl(config, window.location.href.split('#')[0] ?? ''))}>
          Entrar com GitHub
        </Button>
      ) : (
        <>
          <div className="flex gap-2">
            <Button className="flex-1 text-xs" disabled={busy} onClick={upload}>
              Salvar na nuvem
            </Button>
            <Button variant="ghost" className="flex-1 text-xs" disabled={busy} onClick={download}>
              Carregar da nuvem
            </Button>
          </div>
          <Button
            variant="ghost"
            className="self-end text-xs"
            onClick={() => {
              logout();
              setSession(null);
            }}
          >
            Sair
          </Button>
          <h4 className="font-black">Fazendas da comunidade</h4>
          {farms.length === 0 ? (
            <p className="text-wood/70">Ninguém por aqui ainda.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {farms.map((f) => (
                <li key={`${f.name}${f.updated_at ?? ''}`} className="flex justify-between">
                  <span>{f.name}</span>
                  <span className="flex items-center gap-2 text-wood/70">
                    dia {f.day} · {ANIMALS.chicken.icon} {f.animals} · <Coins value={formatCoins(f.money)} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/** Profile hub: GitHub bonus, save files and the cloud. */
export function ProfilePanel() {
  const close = useGameStore((s) => s.closePanel);
  return (
    <Panel title="🐙 Perfil" onClose={close}>
      <div className="flex flex-col gap-3">
        <GitHubSection />
        <FileSection />
        <CloudSection />
      </div>
    </Panel>
  );
}
