# Maquinário agrícola (etapa 10b)

Pedido do usuário em 2026-11-24. Abordagem e detalhes decididos por mim (autonomia do roadmap); as decisões minhas estão marcadas com *(decisão minha)*.

## Intenção

- Arar e colher na mão fica lento quando a fazenda cresce. A máquina resolve isso: um operador num trator ara muito mais rápido, e numa colheitadeira colhe muito mais rápido.
- Pedido do usuário, ponto a ponto:
  1. Modelos 3D das máquinas.
  2. As máquinas ficam num galpão. No nível 2 o galpão ganha uma oficina para manutenção.
  3. Máquinas podem ser compradas ou alugadas. Para alugar, a fazenda precisa de um estacionamento ou de um galpão.
  4. Só um trabalhador especializado em maquinário opera. Dá para contratar um, e o aluguel pode incluir um operador temporário, pagando a mais.

## Objetivos

- Duas máquinas: **trator com arado** (faz as tarefas Arar) e **colheitadeira** (faz as tarefas Colher).
- Nova habilidade **Maquinário** (🚜). Só quem a tem dirige.
- Galpão de máquinas (nível 1 e nível 2 com oficina) e estacionamento.
- Compra e aluguel na Concessionária, com opção de operador no aluguel.
- Desgaste das máquinas próprias e conserto: na oficina, ou chamando o mecânico da cidade.
- Modelos 3D low-poly feitos em código (trator, colheitadeira, galpão nos dois níveis e estacionamento), com rodas que giram e o molinete da colheitadeira girando enquanto colhe.

## Não objetivos

- Outros implementos (plantadeira, pulverizador, carreta) e outras atividades com máquina (plantar, regar, adubar, obras, carga). O desenho deixa espaço para eles, mas ficam para depois.
- Estoque de diesel: o custo de uso é cobrado em moedas por hora de trabalho.
- Máquina usada e mercado de revenda entre jogadores. A revenda da própria máquina à concessionária entra.
- A máquina chegar dirigindo pela rodovia: ela aparece na vaga com um aviso.
- Máquina ocupar mais de um tile no caminho ou precisar de porteira larga.
- Abrigo automatizado (nível 4).

## Anti-objetivos

- Máquina parada no campo para sempre (quebrada, aluguel vencido, fim do expediente): ela sempre volta para a vaga ou some no fim do aluguel.
- Operador que larga a fila do resto da equipe: quem não dirige continua pegando as tarefas como hoje.
- Trator arando dentro da estufa ou colheitadeira em pomar ou estufa.
- Save antigo que não carrega, ou máquina sem vaga depois de carregar.

## Restrições do projeto

- Lógica pura em `src/game/`, balanceamento em `src/data/`, testes Vitest, textos em pt-BR, sem `any`.
- Modelos em metros dentro de `<Meters>`, cores em `palette.ts` ou nos modelos, `flatShading`. Sem marca, logotipo ou pintura que imite um fabricante real.
- Mudar o formato do save exige `SAVE_VERSION` 24 e uma entrada em `migrations`.
- Seletores finos no Zustand; `GameCanvas` estático.

## Abordagens consideradas

- **A. Operador montado, tile a tile (escolhida).** A máquina é dirigida por um operador e multiplica o ritmo das tarefas Arar e Colher que já existem, uma por tile. A fila, a projeção (`projectTasks`), as ordens por área, as prioridades e a ordem "a mais próxima primeiro" continuam iguais. O trator segue de tile em tile pelo vizinho mais próximo, então anda em fileiras.
- **B. Faixa por passada.** Cada tarefa da máquina faz 3 tiles de uma vez. Quebra a regra "uma tarefa, um tile" de que dependem a projeção, o cancelamento por área e a ordem por tile.
- **C. Serviço de área com rota.** O jogador marca um talhão e a máquina percorre uma rota em zigue-zague como um trabalho só. É o mais realista, mas cria um segundo sistema de ordens ao lado da fila, com validação e cancelamento próprios.

A cabe no sistema atual, resolve a lentidão (ritmo de trabalho ×5 e deslocamento ×2) e deixa B e C possíveis depois. *(decisão minha)*

## Desenho

### Dados (`src/data/machines.ts`)

- `MACHINE_IDS = ['tractor', 'harvester']`. Para cada máquina, `MACHINES[id]`:
  - `label`, `icon`, `task` (`'hoe'` ou `'hand'`);
  - `price` (compra): trator 1.800, colheitadeira 3.200;
  - `rentPerDay`: trator 90, colheitadeira 160;
  - `workSpeed` (multiplica o ritmo da tarefa): 5;
  - `driveSpeed` (multiplica o `WALK_SPEED`): 2;
  - `costPerHour` (diesel, só máquina própria, por hora de jogo com a máquina fora da vaga): trator 2, colheitadeira 4;
  - `wearPerHour` (pontos de estado, de 100, por hora de jogo fora da vaga): 1,5;
  - medidas para o modelo (`size` em metros).
- `RENTAL`: dias possíveis `[1, 3, 7]`, desconto por dias (`1: 1`, `3: 0,9`, `7: 0,8`), `operatorPerDay` 40, horário de término (20h do último dia).
- `REPAIR`: `workshopPerNight` (pontos recuperados por noite na oficina, 40), `costPerPoint` 3, `mechanicMultiplier` 2 (o mecânico da cidade cobra o dobro por ponto e a máquina só volta às 6h do dia seguinte).
- `CONDITION`: abaixo de `slowBelow` (30) a máquina trabalha e anda a `slowFactor` (0,7); em 0 está quebrada e não sai da vaga.
- `RESALE`: preço de revenda = `price × (base + perCondition × estado/100)`, com base 0,3 e perCondition 0,4.
- `MACHINERY_WAGE` (moedas por hora a mais para quem tem a habilidade, 1) *(decisão minha: operador é mão de obra mais cara)*.

### Habilidade e equipe (`data/workers.ts`, `game/staff.ts`)

- `SKILL_IDS` ganha `'machinery'` (`Maquinário`, 🚜), com peso 0,15 na geração de candidatos (os outros pesos são reescalados). `TASK_SKILL` não muda: Arar e Colher continuam usando Plantio, e Maquinário só decide quem pode dirigir.
- O salário de quem tem Maquinário soma `MACHINERY_WAGE`.
- Operador do aluguel: um trabalhador `temp` com Maquinário, 2 estrelas e `rentalId`. Ele não ocupa cama, não conta no limite de esporádicos (`TEMP_WORKERS.max`), só no `MAX_WORKERS`, não vai embora às 20h (`releaseTemps` pula quem tem `rentalId`), descansa à noite como os outros e sai quando o aluguel termina. Qualquer operador dirige qualquer máquina, própria ou alugada. Começa com as prioridades `['hoe', 'hand']`, editáveis na ficha. A diária dele está no preço do aluguel e não há salário por hora.

### Estruturas (`data/structures.ts`)

- `machineShed`, Galpão de máquinas: 3×2 tiles (10,5 × 7 m), categoria nova `machines` no painel Construir, custo 600, obra de 900 min, precisa de estrada, **3 vagas**. Níveis em `SHED_LEVELS`: nível 1 é o galpão; nível 2, "Galpão com oficina", custa 450 e 600 min de obra (reforma pela equipe, como a doca) e conserta as máquinas próprias à noite.
- `parkingLot`, Estacionamento: 2×2 tiles (7 × 7 m), categoria `machines`, custo 120, obra de 180 min, precisa de estrada, **2 vagas**, só para máquinas alugadas *(decisão minha: o usuário pediu "estacionamento ou galpão" para o aluguel, e o galpão é o que dá valor a ter a máquina)*.
- `StructureDef.parking { slots, ownedAllowed }`. A demolição é bloqueada com máquina na vaga (`'reserved'`), reaproveitando o erro que já existe.
- Vagas: `parkingSlots(structure)` devolve, em espaço de tile, onde cada máquina fica e para onde aponta (de frente para a saída), girando com a estrutura. O ponto de embarque é o tile do anel de rua em frente à porta (como o `workSpot` das obras).
- Upgrade: `orderUpgrade` aceita o galpão (custo e tempo de `SHED_LEVELS`, como `DOCK_LEVELS`). Durante a reforma o galpão continua guardando as máquinas.

### Estado (`game/types.ts`, save v24)

```ts
interface Machine {
  id: number;
  type: MachineId;
  /** Galpão ou estacionamento onde fica, e a vaga. */
  parkId: number;
  slot: number;
  /** 0–100 (alugadas ficam sempre em 100). */
  condition: number;
  /** Alugada: até quando (minuto de jogo) e o operador que veio junto. Ausente: própria. */
  rental?: { until: number; operatorId?: number };
  /** Com o mecânico da cidade: volta a este minuto, consertada. */
  repairUntil?: number;
  /** Quem está com ela (indo buscar, dirigindo ou voltando). */
  driverId?: number;
  /** Minutos fora da vaga ainda não cobrados (diesel por hora cheia). */
  unpaidMinutes?: number;
}
```

- `GameState.machines: Machine[]`. `Worker.machineId?: number` (a máquina que ele reservou ou dirige) e `Worker.riding?: true` (já embarcou). `Worker.rentalId?` no operador do aluguel.
- A posição da máquina não é salva: parada, é a da vaga; montada, é a do operador. A direção sai do movimento (só na cena).
- Migração v23→v24: `machines: []`; nada mais muda.

### Comportamento (`game/machines.ts`, ligado em `workers.ts`)

- **Máquina disponível** (`availableMachine(state, worker, task)`): parada, sem `driverId`, estado > 0, não está no mecânico, na vaga de uma estrutura ativa (`isActive`, com estrada), `MACHINES[type].task === task.kind` e a tarefa é compatível (`machineCanDo`): Arar em tile sem `cover`; Colher só cultura `kind: 'field'` e tile sem `cover`. Se houver mais de uma, a mais próxima do trabalhador.
- **Escolha de tarefa.** Para um operador (com Maquinário) livre:
  - Montado: só pega tarefas que a máquina dele faz (`bestTask` filtrado), na regra de sempre (prioridade e depois a mais próxima). Sem tarefa assim, ou fora do expediente, volta para a vaga.
  - A pé: se a tarefa escolhida tem máquina disponível, reserva a máquina (`driverId`, `machineId`), anda até o ponto de embarque, embarca (`riding`) e então segue até a tarefa. Sem máquina disponível, faz a tarefa a pé como hoje.
  - Quem não tem Maquinário não muda nada.
- **Montado:** anda a `WALK_SPEED × driveSpeed × estrada × estado` (o bônus de tração de boi e cavalo não vale montado) e trabalha a `workSpeed(operador) × MACHINES.workSpeed × estado`. O bônus de aração de boi e cavalo também não se soma *(decisão minha: a máquina substitui a tração animal)*. Efetividade, colheita extra e domínio por cultura continuam do operador.
- **Volta à vaga.** No fim do expediente, sem tarefa compatível, quando o aluguel termina ou quando o estado chega a 0: termina a tarefa em andamento (no aluguel vencido e no estado 0, larga a tarefa, que volta para a fila), dirige até o ponto de embarque e desembarca: a máquina volta para a vaga e o operador fica livre. Se a vaga deixou de existir (não deveria, a demolição é bloqueada), a máquina vai para a primeira vaga livre que aceitar, ou é vendida pelo preço de revenda com aviso.
- **Custo e desgaste** (por passo de simulação, só máquina própria fora da vaga): o estado cai `wearPerHour`, e a cada hora cheia fora da vaga `costPerHour` sai do dinheiro. O dinheiro nunca fica negativo, como na folha: sem dinheiro para o diesel, a máquina volta para a vaga e o toast avisa. Para isso a máquina guarda as horas de uso ainda não cobradas (`Machine.unpaidMinutes`, fracionário).
- **Conserto.** À meia-noite cada máquina própria parada num galpão nível 2 recupera até `workshopPerNight` pontos, pagando `costPerPoint` por ponto (se não houver dinheiro, conserta o que dá para pagar). Sem oficina, no card da estrutura há "Chamar mecânico": paga `costPerPoint × mechanicMultiplier` pelos pontos que faltam, a máquina fica indisponível (`repairUntil` = 6h do dia seguinte) e volta com 100.
- **Comprar** (`buyMachine(state, type)`): precisa de vaga livre num galpão ativo (erro novo `no-shed`) e de dinheiro. A máquina aparece na primeira vaga livre com estado 100.
- **Vender** (`sellMachine(state, id)`): só própria e parada; paga a revenda.
- **Alugar** (`rentMachine(state, type, days, withOperator)`): precisa de vaga livre num galpão ou estacionamento ativos (erro `no-parking`), de dinheiro (`rentPerDay × days × desconto + operatorPerDay × days`) e, com operador, de espaço em `MAX_WORKERS` (`max-workers`). Termina às 20h do último dia (o dia de hoje conta como o primeiro). Ao terminar: a máquina volta à vaga (se estiver fora) e some; o operador do aluguel sai. Aviso no toast.
- **Devolver antes** (`returnRental`): some como no fim do aluguel, sem reembolso.
- O toast avisa: máquina chegou, aluguel terminou, quebrou (estado 0), consertada.
- Erros novos: `no-shed`, `no-parking`, `no-machine`, `machine-busy`, `machine-broken`, com texto em `ERROR_MESSAGES`.

### Interface

- **Concessionária** (`GaragePanel`): abas "Frete" (o que existe hoje) e "Máquinas". Cada máquina mostra o ícone, o que faz, a velocidade, o preço, o aluguel por dia, "Comprar" e "Alugar" (dias 1/3/7 e a caixa "Com operador (+40/dia)", com o total). Avisos de falta de galpão ou de vaga.
- **Card do galpão ou do estacionamento** (`StructureCard`, seção `MachineSection`): uma linha por vaga, com a máquina, a barra de estado, "própria" ou "alugada até dia X 20h", quem está dirigindo, e "Vender" / "Devolver" / "Chamar mecânico". No galpão nível 1 aparece a reforma para oficina, como nos abrigos.
- **Ficha do trabalhador:** a habilidade Maquinário aparece como as outras; o operador do aluguel mostra "Veio com o aluguel até dia X".
- **Painel Construir:** categoria Máquinas com o galpão e o estacionamento.
- O hover numa máquina mostra o tipo, o estado e quem está dirigindo.

### Cena

- `scene/models/Machines.tsx`, em metros dentro de `<Meters>`:
  - Trator ≈ 4,2 × 2,2 × 2,8 m: capô, cabine com vidros, rodas traseiras grandes (Ø 1,6 m) e dianteiras pequenas (Ø 0,9 m), escapamento, arado de 3 discos atrás. Laranja com detalhes grafite.
  - Colheitadeira ≈ 7,5 × 3,5 × 3,8 m: corpo alto, cabine na frente, plataforma de corte larga com molinete, tubo de descarga dobrado, rodas grandes na frente. Vermelho-terra e creme *(decisão minha: cores genéricas, sem imitar um fabricante)*.
  - Galpão 10,5 × 7 m: estrutura metálica aberta na frente, telhado em arco baixo, piso de concreto com as 3 vagas pintadas. O nível 2 acrescenta bancada, parede de ferramentas, compressor, macaco e uma placa "Oficina" num anexo lateral (`ShedUpgrades`).
  - Estacionamento 7 × 7 m: piso de cascalho, guias e 2 vagas marcadas.
- `scene/Machines.tsx`: desenha cada máquina parada na vaga ou montada na posição do operador, virada para onde anda (giro suavizado). Rodas giram pela distância percorrida; o molinete gira trabalhando. Pós-processamento e sombra como as outras peças. Poucas máquinas, então malhas normais sem `InstancedMesh` *(decisão minha)*.
- `Workers.tsx`: o operador montado não é desenhado em pé; aparece sentado na cabine, numa versão reduzida do `Person`.
- O trator deixa a terra arada como hoje (o `SoilLayer` já faz isso).

### Dev

- `dev.machine('tractor' | 'harvester', rented?)` coloca uma máquina na primeira vaga livre (cria um galpão pronto se não houver).
- `dev.wear(n)` tira `n` pontos de todas as máquinas próprias.
- `dev.operator()` contrata um operador 2 estrelas grátis.

## O que fica para quem constrói

- Medidas finas dos modelos e a pose do operador sentado.
- O ponto exato de embarque de cada vaga, desde que fique no anel de rua em frente à estrutura.
- A ordem das abas e o layout da seção do card, seguindo os componentes existentes (`primitives.tsx`).
- Testes: disponibilidade e compatibilidade de tarefa, embarque e volta, ritmo multiplicado, custo e desgaste, conserto na oficina e no mecânico, compra, venda, aluguel e fim do aluguel com operador, bloqueio da demolição, migração v23→v24.
