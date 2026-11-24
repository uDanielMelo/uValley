# Maquinário agrícola (etapa 10b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trator (Arar) e colheitadeira (Colher) dirigidos por operadores com a habilidade Maquinário, guardados num galpão (nível 2 com oficina) ou num estacionamento, comprados ou alugados na Concessionária.

**Architecture:** A máquina não cria um sistema de ordens novo: um operador "monta" nela e passa a fazer as tarefas `hoe`/`hand` da fila com ritmo ×5 e deslocamento ×2. O estado novo é `GameState.machines` mais dois campos no `Worker`; a posição da máquina é derivada (vaga ou operador). A lógica fica em `src/game/machines.ts` e entra em `stepWorkers` e `advanceGame`.

**Tech Stack:** TypeScript strict, Vitest, React 19 + R3F, Zustand, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-11-24-machinery-design.md`

## Global Constraints

- Lógica pura em `src/game/`, balanceamento só em `src/data/`, sem `any`, identificadores em inglês, textos da interface em pt-BR.
- `noUncheckedIndexedAccess`: todo acesso por índice trata `undefined`.
- Save: `SAVE_VERSION` 24, migração `23 → 24` acrescenta `machines: []`.
- Valores do spec: trator 1.800 / aluguel 90 por dia / diesel 2 por hora; colheitadeira 3.200 / 160 / 4; `workSpeed` 5; `driveSpeed` 2; `wearPerHour` 1,5; aluguel de 1, 3 ou 7 dias com desconto 1 / 0,9 / 0,8; `operatorPerDay` 40; `REPAIR` 40 pontos por noite, 3 por ponto, mecânico ×2 e pronto às 6h do dia seguinte; abaixo de 30 de estado, ×0,7; em 0, quebrada; revenda `price × (0,3 + 0,4 × estado/100)`; `MACHINERY_WAGE` 1; peso 0,15 na geração.
- Galpão 3×2, 600 moedas, 900 min, 3 vagas; nível 2 (oficina) 450 moedas e 600 min. Estacionamento 2×2, 120 moedas, 180 min, 2 vagas, só para alugadas.
- Modelos em metros dentro de `<Meters>`, `flatShading`, sem marca nem pintura de fabricante real.
- Valide cada task com `npm run build` e `npm test`.

## Review Focus

- Alugar depois das 20h: o aluguel não pode terminar na hora. O primeiro dia passa a ser amanhã (teste na Task 3).
- Operador indo buscar a máquina quando a tarefa dele é cancelada ou o expediente acaba: a reserva tem que ser solta (teste na Task 4).
- Operador demitido, sem salário ou com o aluguel vencido enquanto dirige: a máquina não pode ficar órfã no campo e volta para a vaga (teste na Task 4).
- Vender ou devolver uma máquina em uso: erro `machine-busy`, nada muda (teste na Task 3).
- Galpão sem estrada (o jogador removeu a rua): as máquinas paradas lá não ficam disponíveis, e as que estão fora ainda conseguem estacionar (teste na Task 4).

---

### Task 1: Dados, tipos e save v24

**Files:**
- Create: `src/data/machines.ts`
- Modify: `src/data/workers.ts` (`SKILL_IDS`, `SKILLS`, `SKILL_WEIGHTS`, `MACHINERY_WAGE`)
- Modify: `src/game/types.ts` (`Machine`, `GameState.machines`, campos do `Worker`, erros novos)
- Modify: `src/game/staff.ts` (`hourlyWageFor`)
- Modify: `src/game/state.ts` (`machines: []`)
- Modify: `src/game/save.ts` (`parseMachine`, campos do worker, `SAVE_VERSION = 24`, `migrations[23]`)
- Test: `src/game/__tests__/machines.test.ts`

**Interfaces:**
- Produces:
  - `MACHINE_IDS = ['tractor', 'harvester'] as const`, `type MachineId`.
  - `MACHINES: Record<MachineId, MachineDef>`, com `MachineDef { id; label; icon; task: 'hoe' | 'hand'; price; rentPerDay; workSpeed; driveSpeed; costPerHour; wearPerHour; size: { length; width; height } }` (metros).
  - `RENTAL = { days: [1, 3, 7], discount: { 1: 1, 3: 0.9, 7: 0.8 }, operatorPerDay: 40 }`, `type RentalDays = 1 | 3 | 7`.
  - `REPAIR = { workshopPerNight: 40, costPerPoint: 3, mechanicMultiplier: 2, mechanicReadyHour: 6 }`.
  - `CONDITION = { max: 100, slowBelow: 30, slowFactor: 0.7 }`, `RESALE = { base: 0.3, perCondition: 0.4 }`.
  - `interface Machine { id; type: MachineId; parkId; slot; condition; rental?: { until: number; operatorId?: number }; repairUntil?: number; driverId?: number; unpaidMinutes?: number }`.
  - `Worker.machineId?: number`, `Worker.riding?: true`, `Worker.rentalId?: number` (o id da máquina alugada com que veio).
  - `ActionError` ganha `'no-shed' | 'no-parking' | 'no-machine' | 'machine-busy' | 'machine-broken'`.
  - `hourlyWageFor(stars: Stars, specialty: Specialty | null, skills: readonly SkillId[] = []): number`.

- [ ] **Step 1: Escrever os testes que falham** em `machines.test.ts` (`describe('machine save')`):
  - `round-trips machines and riding workers`: estado com `machines: [{ id: 900, type: 'tractor', parkId: <casa>, slot: 0, condition: 62.5, rental: { until: 5000, operatorId: 901 }, driverId: 901, unpaidMinutes: 12 }]` e um worker `{ machineId: 900, riding: true, rentalId: 900 }` → `deserialize(serialize(...))` devolve os mesmos campos.
  - `drops a machine with an unknown type`: `type: 'plane'` → a lista carregada vem vazia.
  - `migrates v23 saves with no machines`: um save v23 (o JSON de `serialize` com `saveVersion: 23` e sem `machines`) → `game.machines` é `[]`.
  - `pays the machinery wage`: `hourlyWageFor(2, null, ['machinery'])` === `STAR_LEVELS[2].hourlyWage + MACHINERY_WAGE`; com `['farming']` === `STAR_LEVELS[2].hourlyWage`.
- [ ] **Step 2: Rodar e ver falhar:** `npm test -- machines` → FAIL (módulo `data/machines` não existe).
- [ ] **Step 3: Implementar** os dados, os tipos e o save. `SKILLS.machinery = { label: 'Maquinário', icon: '🚜' }`. `SKILL_WEIGHTS = { farming: 0.42, animals: 0.26, construction: 0.17, machinery: 0.15 }`. `TASK_SKILL` não muda. `rollProfile` passa `skills` para `hourlyWageFor`. `parseMachine` valida cada campo como `parseWorker` (descarta o que não valida). `migrations[23] = (data) => ({ ...data, machines: [], saveVersion: 24 })`.
- [ ] **Step 4: Rodar:** `npm test` → PASS; `npm run build` → sem erros (corrija os lugares que montam `GameState` à mão nos testes, se o tipo pedir).
- [ ] **Step 5: Commit:** `git commit -m "Add machine data, the machinery skill and save v24"`

---

### Task 2: Galpão, estacionamento e vagas

**Files:**
- Modify: `src/data/structures.ts` (`machineShed`, `parkingLot`, categoria `machines`, `ParkingDef`, `SHED_LEVELS`, `CATEGORY_LABELS`, `BUILDABLE_IDS`)
- Modify: `src/game/structures.ts` (`upgradeCost`, `upgradeMinutes`, `checkDemolish`)
- Modify: `src/game/construction.ts` (`checkUpgrade` aceita o galpão)
- Create: `src/game/parking.ts`
- Test: `src/game/__tests__/parking.test.ts`

**Interfaces:**
- Consumes: `Machine` (Task 1).
- Produces:
  - `StructureDef.parking?: { slots: number; owned: boolean }` (galpão `{ slots: 3, owned: true }`, estacionamento `{ slots: 2, owned: false }`). Ambos com `needsRoad`.
  - `SHED_LEVELS: Record<1 | 2, { label: string; cost: number; buildMinutes: number; workshop: boolean }>`: `1: { 'Galpão', 0, 0, false }`, `2: { 'Galpão com oficina', 450, 600, true }`.
  - Em `parking.ts`:
    - `parkingDef(s: StructureInstance): ParkingDef | null`
    - `hasWorkshop(s: StructureInstance): boolean` (galpão com `level >= 2`)
    - `slotPoint(s: StructureInstance, slot: number): { x: number; y: number; heading: Rotation }`: centro da vaga dentro da estrutura (`frontPoint(s, -depth/2, across)`, `across = (slot + 0.5) × width/slots − width/2`), virada para a frente.
    - `boardingPoint(s: StructureInstance, slot: number): GridPoint`: `frontPoint(s, 0.5, across)`, no anel de rua.
    - `freeSlot(state: GameState, rented: boolean): { parkId: number; slot: number } | null`: só estruturas `isActive` com `parking`; próprias só no galpão; alugadas preferem o estacionamento e depois o galpão; a vaga mais baixa sem máquina.

- [ ] **Step 1: Escrever os testes que falham** (`parking.test.ts`), com o galpão posto por `placeStructure(s, 'machineShed', 20, 40, 0, { free: true })`:
  - `offers the shed's three slots to owned machines`: `freeSlot(s, false)` → `{ parkId: shed.id, slot: 0 }`; com máquinas nas vagas 0 e 1 → `slot: 2`; com as 3 ocupadas → `null`.
  - `keeps owned machines out of the parking lot`: só um estacionamento → `freeSlot(s, false)` é `null` e `freeSlot(s, true)` aponta para ele.
  - `rented machines prefer the parking lot`: galpão e estacionamento → `freeSlot(s, true).parkId === lot.id`.
  - `boards on the road ring in front`: `boardingPoint(shed, 1)` cai num tile com `road`; `slotPoint(shed, 0..2)` cai em tiles da pegada, com x distintos (rotação 0) e com y distintos para a rotação 1.
  - `blocks demolishing a shed with a machine`: máquina na vaga → `checkDemolish` devolve `'reserved'`.
  - `upgrades the shed to a workshop`: `orderUpgrade` cobra 450, cria `work { kind: 'upgrade', total: 600, toLevel: 2 }`; depois de `completeAllWork`, `hasWorkshop` é true; nova `checkUpgrade` → `'max-level'`.
  - `a cut-off shed has no free slot`: remover os tiles de estrada do anel (`tiles` com `road` apagado) → `freeSlot` é `null`.
- [ ] **Step 2: Rodar e ver falhar:** `npm test -- parking` → FAIL.
- [ ] **Step 3: Implementar.** Descrições: galpão "Guarda 3 máquinas. Reforme para ter oficina." e estacionamento "2 vagas para máquinas alugadas.". `CATEGORY_LABELS.machines = 'Máquinas'`. `upgradeCost`/`upgradeMinutes` leem `SHED_LEVELS` para `machineShed` (como fazem com `DOCK_LEVELS`); `checkUpgrade` aceita o galpão com o próximo nível até 2. `checkDemolish` devolve `'reserved'` quando alguma `state.machines[].parkId === found.id`.
- [ ] **Step 4: Rodar:** `npm test` e `npm run build` → PASS. Se `STRUCTURE_MODELS` reclamar dos ids novos, registre um modelo provisório (`Warehouse`) até a Task 7.
- [ ] **Step 5: Commit:** `git commit -m "Add the machine shed and parking lot with their slots"`

---

### Task 3: Comprar, vender, alugar e devolver

**Files:**
- Create: `src/game/machines.ts`
- Modify: `src/game/staff.ts` (`tempCount` e `releaseTemps` ignoram quem tem `rentalId`)
- Modify: `src/game/simulation.ts` (chama `endRentals` a cada passo; o resultado ganha `machineEvents`)
- Test: `src/game/__tests__/machines.test.ts`

**Interfaces:**
- Consumes: `freeSlot` (Task 2), `rollProfile`, `makeWorker`, `homeSpot`.
- Produces:
  - `resalePrice(m: Machine): number` (arredondado para baixo; alugada → 0)
  - `rentalCost(type: MachineId, days: RentalDays, withOperator: boolean): number` = `round(rentPerDay × days × discount) + (withOperator ? operatorPerDay × days : 0)`
  - `rentalEnd(gameMinutes: number, days: RentalDays): number`: 20h do último dia; se já passou das 20h, o primeiro dia é amanhã.
  - `buyMachine(state, type): ActionResult` (`no-shed`, `not-enough-money`)
  - `sellMachine(state, machineId): ActionResult` (`no-machine`, `machine-busy` com `driverId`, alugada → `no-machine`)
  - `rentMachine(state, type, days, withOperator): ActionResult` (`no-parking`, `not-enough-money`, `max-workers`). Com operador: `makeWorker(id, 'temp', profile)` com `stars: 2`, `skills` contendo `'machinery'`, `hourlyWage: 0`, `priorities: ['hoe', 'hand']`, `rentalId` = id da máquina; a máquina guarda `rental.operatorId`.
  - `returnRental(state, machineId): ActionResult` (`machine-busy` se estiver sendo dirigida; senão tira a máquina e o operador dela)
  - `type MachineEvent = { kind: 'arrived' | 'rental-ended' | 'broke' | 'repaired' | 'no-fuel'; type: MachineId }`
  - `endRentals(state): { state: GameState; events: MachineEvent[] }`: tira as alugadas com `until <= gameMinutes` que não estão sendo dirigidas, e o operador do aluguel quando `until` passou e ele não está montado.
  - `rehomeMachines(state): GameState`: chamada no carregamento (`save.ts`, ao lado de `rehomeAnimals`); máquina cuja estrutura não existe, não aceita o tipo de posse ou cuja vaga está repetida vai para `freeSlot`, e sem vaga a própria é vendida por `resalePrice` e a alugada some (com o operador).

- [ ] **Step 1: Escrever os testes que falham:**
  - `buys a tractor into the shed`: dinheiro 5.000 → `buyMachine` cobra 1.800 e cria `{ type: 'tractor', parkId: shed.id, slot: 0, condition: 100 }`, sem `rental`; sem galpão → `'no-shed'`.
  - `sells for the resale price`: estado 50 → `sellMachine` paga `floor(1800 × (0.3 + 0.4 × 0.5))` = 900 e tira a máquina.
  - `will not sell or return a machine being driven`: com `driverId` → `sellMachine` e `returnRental` devolvem `'machine-busy'`.
  - `rents with an operator`: estacionamento, 3 dias com operador → cobra `round(90 × 3 × 0.9) + 120` = 363; cria máquina com `rental.until === rentalEnd(now, 3)` e um worker `temp` com `'machinery'`, `rentalId` e `hourlyWage: 0`; `tempCount` não o conta.
  - `starts tomorrow when rented after the shift`: às 21h do dia 1, `rentalEnd(now, 1)` = 20h do dia 2; às 10h do dia 1 = 20h do dia 1.
  - `ends rentals at the end of the last day`: avançar até `until` → `endRentals` tira a máquina e o operador e devolve `{ kind: 'rental-ended', type: 'tractor' }`; `releaseTemps` às 20h de um dia anterior não tira o operador.
  - `keeps a rented machine until its driver parks`: com `driverId` e `until` passado → `endRentals` não tira ainda.
  - `rehomes machines whose shed is gone`: máquina própria com `parkId` inexistente e um segundo galpão com vaga → vai para ele; sem vaga nenhuma → some e o dinheiro sobe `resalePrice`.
- [ ] **Step 2: Rodar e ver falhar:** `npm test -- machines` → FAIL.
- [ ] **Step 3: Implementar** `machines.ts` e as mudanças em `staff.ts`. Em `advanceGame`, chamar `endRentals` depois de `stepWorkers` e juntar os eventos num novo campo `machineEvents: MachineEvent[]` do resultado (vazio no retorno antecipado de `dtMinutes <= 0`).
- [ ] **Step 4: Rodar:** `npm test` e `npm run build` → PASS.
- [ ] **Step 5: Commit:** `git commit -m "Buy, sell, rent and return machines"`

---

### Task 4: Operador montado

**Files:**
- Modify: `src/game/machines.ts`
- Modify: `src/game/workers.ts` (`bestTask`, `stepWorkers`)
- Test: `src/game/__tests__/machineDriving.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3, `taskSpot`, `findPath`, `isActive`.
- Produces:
  - `isOperator(w: Worker): boolean`
  - `machineCanDo(state, type: MachineId, task: Task): boolean`: `task.kind === MACHINES[type].task`, tile sem `cover`; colher só se a cultura do tile for `kind: 'field'`.
  - `mustPark(state, m: Machine): boolean`: estado ≤ 0, `repairUntil` no futuro, aluguel vencido ou (própria) `money < costPerHour`.
  - `availableMachine(state, worker, task): Machine | undefined`: sem `driverId`, `!mustPark`, estrutura da vaga `isActive`, `machineCanDo`; a mais próxima do trabalhador.
  - `conditionFactor(m: Machine): number` (1, ou `slowFactor` abaixo de `slowBelow`)
  - `releaseOrphanMachines(state): GameState`: tira `driverId` de máquinas cujo motorista não existe mais ou não tem `machineId` igual (a máquina volta para a vaga na hora).
- Comportamento em `stepWorkers`:
  1. Operador livre e a pé escolhe a tarefa como hoje. Se `availableMachine` acha uma, reserva (`machine.driverId`, `worker.machineId`) e o caminho vai até `boardingPoint`.
  2. Com `machineId`, sem `riding`, ao chegar ao ponto de embarque (caminho vazio, a `HOME_EPSILON`) → `riding: true` e caminho até `taskSpot`. Se a tarefa sumiu ou acabou o expediente antes de embarcar → solta a reserva.
  3. Montado: só pega tarefas com `machineCanDo` (filtro em `bestTask`). Anda a `WALK_SPEED × driveSpeed × groundSpeed × conditionFactor`, sem `labor.walk`; trabalha a `workSpeed × MACHINES.workSpeed × conditionFactor`, sem `labor.hoe`.
  4. Montado sem tarefa compatível, fora do expediente ou com `mustPark` → larga a tarefa (volta para a fila sem `workerId`), vai ao ponto de embarque e desembarca: limpa `machineId`, `riding` e `driverId`.
  5. A tarefa de colher feita montado continua chamando `effectivenessBonus` e `gainMastery`.

- [ ] **Step 1: Escrever os testes que falham** (galpão com trator, um operador e tiles de grama próprios enfileirados com `applyArea(s, 'hoe', tiles, 'wheat', 'queue')`; avançar com `stepWorkers` em passos de 1 min):
  - `an operator fetches the tractor and plows`: depois de alguns passos o worker tem `riding: true` e a máquina `driverId`; ao fim, os tiles estão `tilled`.
  - `plows five times faster mounted`: minutos para arar 1 tile parado ao lado (caminho vazio) com e sem máquina → razão de 5 (± passo).
  - `non-operators ignore machines`: worker sem a habilidade ara a pé e a máquina não ganha `driverId`.
  - `the harvester skips orchards and greenhouses`: `machineCanDo(s, 'harvester', task)` é false para laranjeira e para tile com `cover`, true para trigo maduro; `machineCanDo(s, 'tractor', hoeOnCover)` é false.
  - `parks at the end of the shift`: montado às 19h59 → depois das 20h e do caminho de volta, `machineId`, `riding` e `driverId` somem e a máquina está na vaga.
  - `drops the reservation when the task is cancelled`: reservado, sem embarcar, `applyArea(..., 'cancel')` → no passo seguinte `driverId` some.
  - `a dismissed driver leaves no orphan machine`: montado, `dismissWorker` → `releaseOrphanMachines` limpa `driverId`.
  - `a cut-off shed lends nothing but takes machines back`: com a máquina fora e a estrada do anel apagada, `availableMachine` para outro operador é `undefined`, e o motorista atual ainda desembarca.
- [ ] **Step 2: Rodar e ver falhar:** `npm test -- machineDriving` → FAIL.
- [ ] **Step 3: Implementar** em `machines.ts` e `workers.ts`; `releaseOrphanMachines` roda no começo de `stepWorkers`.
- [ ] **Step 4: Rodar:** `npm test` e `npm run build` → PASS (os testes de `workers.test.ts` existentes continuam verdes).
- [ ] **Step 5: Commit:** `git commit -m "Let machinery operators drive the tractor and the harvester"`

---

### Task 5: Desgaste, diesel e conserto

**Files:**
- Modify: `src/game/machines.ts`
- Modify: `src/game/simulation.ts` (`stepMachines` a cada passo; `repairAtWorkshops` à meia-noite)
- Test: `src/game/__tests__/machines.test.ts`

**Interfaces:**
- Produces:
  - `stepMachines(state, minutes): { state: GameState; events: MachineEvent[] }`: para cada máquina própria com motorista montado, o estado cai `wearPerHour × minutes/60` (mínimo 0, evento `broke` ao chegar a 0) e soma `unpaidMinutes`; a cada 60 cobra `costPerHour` se houver dinheiro (senão, evento `no-fuel` e `mustPark` faz voltar). Máquinas com `repairUntil <= gameMinutes` voltam com 100 (evento `repaired`).
  - `repairAtWorkshops(state): { state: GameState; events: MachineEvent[] }`: próprias paradas num galpão com `hasWorkshop` ganham até `workshopPerNight` pontos, pagando `costPerPoint` por ponto, limitado pelo dinheiro.
  - `mechanicCost(m: Machine): number` = `ceil(100 − condition) × costPerPoint × mechanicMultiplier`
  - `callMechanic(state, machineId): ActionResult` (`no-machine`, `machine-busy`, `not-enough-money`; alugada → `no-machine`; com oficina também pode). Define `repairUntil` = 6h do dia seguinte.

- [ ] **Step 1: Escrever os testes que falham:**
  - `wears and burns diesel while driven`: própria montada, 120 min → estado 97 e dinheiro −4 (trator); alugada → estado 100 e dinheiro igual.
  - `breaks at zero and goes home`: estado 0,5 e 60 min → estado 0, evento `broke`, `mustPark` true.
  - `no money, no diesel`: dinheiro 1 e 60 min montado → evento `no-fuel`, `mustPark` true, dinheiro continua 1.
  - `the workshop repairs overnight`: galpão nível 2, estado 50, dinheiro 1.000 → `repairAtWorkshops` deixa 90 e cobra 120; num galpão nível 1, nada muda; com dinheiro 30 → recupera 10.
  - `the mechanic charges double and is back at six`: estado 60, `callMechanic` cobra 240, `repairUntil` = 6h de amanhã; antes disso `availableMachine` não a devolve; depois de `stepMachines` nessa hora → estado 100, evento `repaired`.
  - `slow below thirty`: `conditionFactor` com estado 29 é 0,7 e com 30 é 1.
- [ ] **Step 2: Rodar e ver falhar:** `npm test -- machines` → FAIL.
- [ ] **Step 3: Implementar** e ligar em `advanceGame` (`stepMachines` logo depois de `stepWorkers`; `repairAtWorkshops` no bloco da meia-noite), somando os eventos em `machineEvents`.
- [ ] **Step 4: Rodar:** `npm test` e `npm run build` → PASS.
- [ ] **Step 5: Commit:** `git commit -m "Wear machines down, charge diesel and repair them"`

---

### Task 6: Store e interface

**Files:**
- Modify: `src/store/gameStore.ts` (ações, `ERROR_MESSAGES`, toasts de `machineEvents`, `garageTab`)
- Modify: `src/ui/GaragePanel.tsx` (abas Frete e Máquinas)
- Create: `src/ui/MachineSection.tsx` (seção do card do galpão e do estacionamento)
- Modify: `src/ui/StructureCard.tsx` (mostra a seção e a reforma do galpão)
- Modify: a ficha do trabalhador em `src/ui/team/` ("Veio com o aluguel até dia X, 20h")
- Modify: `src/ui/HoverInfo.tsx` (máquina sob o cursor: tipo, estado, quem dirige)

**Interfaces:**
- Consumes: `buyMachine`, `sellMachine`, `rentMachine`, `returnRental`, `callMechanic`, `resalePrice`, `rentalCost`, `mechanicCost`, `MachineEvent`.
- Produces (store): `buyMachine(type)`, `sellMachine(id)`, `rentMachine(type, days, withOperator)`, `returnRental(id)`, `callMechanic(id)`, `garageTab: 'freight' | 'machines'`, `setGarageTab`.
- Textos de erro: `no-shed` "Construa um galpão de máquinas com estrada e vaga livre.", `no-parking` "Precisa de um estacionamento ou galpão com estrada e vaga livre.", `no-machine` "Máquina não encontrada.", `machine-busy` "A máquina está em uso. Espere ela voltar para a vaga.", `machine-broken` "A máquina está quebrada.".
- Toasts: arrived "🚜 Trator chegou ao galpão.", rental-ended "Aluguel do trator terminou.", broke "O trator quebrou e voltou para a vaga.", repaired "Trator consertado.", no-fuel "Sem dinheiro para o diesel: o trator voltou para a vaga." (com o rótulo da máquina).

- [ ] **Step 1: Implementar** as ações do store, as abas da Concessionária (cartão por máquina: o que faz, "ara 5× mais rápido", preço, aluguel por dia, "Comprar", dias 1/3/7, a caixa "Com operador (+40/dia)" e o total por `rentalCost`, avisos `no-shed`/`no-parking` em âmbar), a `MachineSection` (uma linha por vaga: máquina, barra de estado, "própria" ou "alugada até dia X, 20h", motorista, "Vender por N", "Devolver", "Chamar mecânico (N)") e a reforma do galpão no card, usando os componentes de `primitives.tsx`.
- [ ] **Step 2: Verificar:** `npm run build` → sem erros; `npm test` → PASS.
- [ ] **Step 3: Verificar no navegador** (`npm run dev` já rodando na 5173 ou em outra porta; não derrubar o servidor do usuário): construir galpão pelo dev, comprar trator, ver a linha no card, alugar com operador, ver a ficha.
- [ ] **Step 4: Commit:** `git commit -m "Buy and rent machines at the dealership and manage them from the shed"`

---

### Task 7: Modelos 3D e cena

**Files:**
- Create: `src/scene/models/Machines.tsx` (`Tractor`, `Harvester`, `MachineShed`, `ShedUpgrades`, `ParkingLot`)
- Modify: `src/scene/structureModels.tsx` (registra `machineShed` e `parkingLot`)
- Create: `src/scene/Machines.tsx` (desenha as máquinas)
- Modify: `src/scene/GameCanvas.tsx` (monta `<Machines />`)
- Modify: `src/scene/Workers.tsx` (operador montado sentado na cabine)
- Modify: `src/scene/palette.ts` (cores das máquinas)
- Modify: `src/game/machines.ts` (`machinePose`)

**Interfaces:**
- Produces: `machinePose(state, m: Machine): { x: number; y: number; heading: number | null; working: boolean }` em `machines.ts`: na vaga, `slotPoint` com a direção dela; montada, a posição do motorista, `heading: null` (a cena tira da velocidade) e `working` quando a tarefa dele está em andamento.

- [ ] **Step 1: Teste de `machinePose`** em `machines.test.ts`: parada → igual a `slotPoint`; montada → igual à posição do motorista. Rodar: FAIL, implementar, PASS.
- [ ] **Step 2: Modelar** em metros (`<Meters>`), com as medidas do spec: trator laranja e grafite com rodas traseiras de Ø 1,6 m e dianteiras de Ø 0,9 m, cabine com vidro, escapamento e arado de 3 discos; colheitadeira vermelho-terra e creme com plataforma de corte, molinete, cabine e tubo de descarga; galpão metálico aberto na frente com as 3 vagas pintadas; anexo da oficina no nível 2 (bancada, parede de ferramentas, compressor, placa "Oficina"); estacionamento de cascalho com 2 vagas.
- [ ] **Step 3: Cena.** `Machines.tsx` lê `useGameStore.getState()` dentro do `useFrame`, suaviza o giro para a direção do movimento, gira as rodas pela distância andada e o molinete quando `working`. `Workers.tsx` pula a pessoa em pé quando `riding` e desenha o `Person` sentado e reduzido no banco da máquina.
- [ ] **Step 4: Verificar:** `npm run build` e `npm test` → PASS; no navegador, conferir de perto e de longe, de dia e de noite, e com o operador arando uma área.
- [ ] **Step 5: Commit:** `git commit -m "Model the tractor, the harvester, the machine shed and the parking lot"`

---

### Task 8: Dev, documentação e fechamento

**Files:**
- Modify: `src/game/dev.ts`, `src/ui/devTools.ts` (`dev.machine(type, rented?)`, `dev.wear(n)`, `dev.operator()`, linhas no `dev.help()`)
- Modify: `CLAUDE.md` (estrutura, modelo do jogo: Maquinário, save v24, roadmap)
- Modify: `docs/roadmap.md` (Etapa 10b ✅ e as decisões minhas)

- [ ] **Step 1: Teste** em `machines.test.ts`: `addMachine(state, 'tractor')` (função de `dev.ts`) sem galpão cria um galpão pronto e põe o trator na vaga 0; `wearMachines(state, 30)` tira 30 de cada própria. Rodar: FAIL → implementar → PASS.
- [ ] **Step 2: Documentar** em `CLAUDE.md` e `docs/roadmap.md`.
- [ ] **Step 3: Verificar:** `npm run build` e `npm test` → PASS; teste completo no navegador (comprar, alugar com operador, arar e colher numa área grande, oficina à noite, mecânico, fim do aluguel, salvar e recarregar no meio do trabalho).
- [ ] **Step 4: Commit:** `git commit -m "Add machine dev tools and document stage 10b"`
