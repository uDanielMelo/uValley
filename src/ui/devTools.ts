import { ANIMAL_IDS, type AnimalId } from '../data/animals';
import {
  addMoney,
  addProduce,
  addSeeds,
  finishAllTasks,
  finishWorks,
  growAll,
  hireFree,
  readyAllProducts,
  setMoney,
  setTimeOfDay,
  skipMinutes,
  spawnAnimals,
  unlockAll,
  waterAll,
} from '../game/dev';
import type { GameState } from '../game/types';
import { useGameStore } from '../store/gameStore';

/** Dev tools are on in `npm run dev`, or in any build opened with `?dev` in the URL. */
export const DEV_ENABLED =
  import.meta.env.DEV || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('dev'));

const apply = (transform: (g: GameState) => GameState, message?: string) =>
  useGameStore.getState().devApply(transform, message);

const isAnimal = (v: string): v is AnimalId => ANIMAL_IDS.some((id) => id === v);

const HELP = `uValley — comandos de dev (use no console):
  dev.money(1000)        soma dinheiro (negativo tira)
  dev.setMoney(5000)     define o dinheiro
  dev.time(18)           vai para 18h do dia atual (aceita 6.5 = 06:30)
  dev.skip(3)            avança 3 horas simulando tudo
  dev.days(2)            avança 2 dias
  dev.speed(10)          multiplica a velocidade do tempo (1 = normal)
  dev.seeds(10)          +10 sementes de cada cultura
  dev.produce(10)        +10 de cada colheita e produto animal
  dev.grow()             todas as plantas ficam prontas
  dev.water()            rega todas as plantas
  dev.unlock()           libera todos os lotes
  dev.hire(2)            contrata 2 trabalhadores de graça
  dev.finish()           conclui toda a fila de tarefas (obras incluídas)
  dev.build()            conclui obras e demolições em andamento
  dev.spawn('cow', 3)    cria animais: ${ANIMAL_IDS.join(', ')}
  dev.products()         todos os animais com produto pronto
  dev.state()            mostra o estado atual do jogo
  Painel visual: tecla F2`;

const devApi = {
  help: () => console.info(HELP),
  money: (amount: number) => apply((g) => addMoney(g, amount), `${amount >= 0 ? '+' : ''}${amount} moedas`),
  setMoney: (amount: number) => apply((g) => setMoney(g, amount), `Dinheiro = ${amount}`),
  time: (hour: number) => apply((g) => setTimeOfDay(g, hour), `Hora: ${hour}h`),
  skip: (hours: number) => apply((g) => skipMinutes(g, hours * 60), `+${hours} h`),
  days: (days = 1) => apply((g) => skipMinutes(g, days * 1440), `+${days} dia(s)`),
  speed: (scale: number) => {
    useGameStore.getState().setDevTimeScale(scale);
    useGameStore.getState().showMessage(`🛠️ Tempo ×${scale}`, 'info');
  },
  seeds: (amount = 10) => apply((g) => addSeeds(g, amount), `+${amount} sementes de cada`),
  produce: (amount = 10) => apply((g) => addProduce(g, amount), `+${amount} de cada produto`),
  grow: () => apply(growAll, 'Plantas prontas'),
  water: () => apply(waterAll, 'Tudo regado'),
  unlock: () => apply(unlockAll, 'Todos os lotes liberados'),
  hire: (count = 1) =>
    apply((g) => Array.from({ length: count }).reduce<GameState>((s) => hireFree(s), g), `+${count} trabalhador(es)`),
  finish: () => apply(finishAllTasks, 'Fila concluída'),
  build: () => apply(finishWorks, 'Obras concluídas'),
  spawn: (kind: string, count = 1) => {
    if (!isAnimal(kind)) {
      console.warn(`Animal desconhecido "${kind}". Use: ${ANIMAL_IDS.join(', ')}`);
      return;
    }
    apply((g) => spawnAnimals(g, kind, count), `+${count} ${kind}`);
  },
  products: () => apply(readyAllProducts, 'Produtos prontos'),
  state: () => useGameStore.getState().game,
};

declare global {
  interface Window {
    /** Dev console commands; see `dev.help()`. */
    dev?: typeof devApi;
  }
}

/** Installs `window.dev` and prints the command list once. */
export const installDevTools = (): void => {
  if (!DEV_ENABLED || typeof window === 'undefined' || window.dev) return;
  window.dev = devApi;
  console.info('🛠️ uValley dev: digite dev.help() para ver os comandos, ou aperte F2 para o painel.');
};

export const devCommands = devApi;
