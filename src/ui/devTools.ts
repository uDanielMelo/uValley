import { ANIMAL_IDS, type AnimalId } from '../data/animals';
import { DISEASE_IDS, PREDATORS, PREDATOR_IDS, type DiseaseId } from '../data/health';
import { shelterDef, shelterDoor } from '../game/shelters';
import { frontPoint } from '../game/structures';
import {
  addMedicine,
  addMoney,
  ageAnimals,
  addProduce,
  addSeeds,
  finishAllTasks,
  finishWorks,
  forceRaid,
  growAll,
  healAll,
  hireFree,
  readyAllProducts,
  setMoney,
  setTimeOfDay,
  sickenAnimal,
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

/** Which predator the next attack preview shows. */
let previewTurn = -1;

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
  dev.age(24)            envelhece os animais 24 h reais (12 filhote→jovem, 72 adulto→idoso, 96 morre)
  dev.sick('flu')        adoece um animal saudável (worms, flu, infection, wound), já percebido
  dev.heal()             cura todos os animais
  dev.attack()           um predador ataca o abrigo com mais animais (a câmera vai até lá)
  dev.preview()          só a animação do ataque, sem ferir ninguém (alterna raposa, cachorro-do-mato, onça)
  dev.medicine(5)        +5 doses de cada remédio
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
  age: (hours = 24) => apply((g) => ageAnimals(g, hours), `Animais +${hours} h de idade`),
  sick: (disease: DiseaseId = 'flu') => {
    if (!DISEASE_IDS.includes(disease)) {
      console.warn(`Doença desconhecida: ${disease}. Use: ${DISEASE_IDS.join(', ')}`);
      return;
    }
    apply((g) => sickenAnimal(g, disease), `Animal doente (${disease})`);
  },
  heal: () => apply(healAll, 'Todos curados'),
  attack: () => {
    const { game, devApply, reportAttacks, showMessage } = useGameStore.getState();
    const raid = forceRaid(game);
    if (!raid.attack) {
      showMessage('🛠️ Nenhum animal para atacar', 'info');
      return;
    }
    devApply(() => raid.state);
    reportAttacks([raid.attack]);
    useGameStore.getState().focusCamera(raid.attack.x, raid.attack.y);
  },
  preview: () => {
    const { game, showSighting, focusCamera, showMessage } = useGameStore.getState();
    // The shelter with most animals (else any shelter, else the house door).
    const shelters = game.structures.filter((s) => shelterDef(s.type));
    const heads = (id: number) => game.animals.filter((a) => a.shelterId === id).length;
    const shelter = shelters.sort((a, b) => heads(b.id) - heads(a.id))[0];
    const house = game.structures.find((s) => s.type === 'house');
    const spot = shelter ? shelterDoor(shelter) : house ? frontPoint(house, 0.6) : { x: 16, y: 18 };
    previewTurn = (previewTurn + 1) % PREDATOR_IDS.length;
    const predator = PREDATOR_IDS[previewTurn] ?? 'fox';
    focusCamera(spot.x, spot.y);
    // A beat later, so the camera is already there when it appears.
    window.setTimeout(() => showSighting(predator, spot.x, spot.y), 400);
    showMessage(`🛠️ Prévia: ${PREDATORS[predator].label.toLowerCase()} (ninguém se feriu)`, 'info');
  },
  medicine: (amount = 5) => apply((g) => addMedicine(g, amount), `+${amount} doses de cada remédio`),
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
