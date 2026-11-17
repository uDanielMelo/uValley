# uValley

Jogo de fazenda 3D para navegador, low-poly, 100% gerado por código (sem Blender/editor 3D). Câmera perspectiva orbital (girar, inclinar, zoom, pan), grid de tiles 32×32, single-player com save local.

## Comandos

- `npm run dev`: servidor de desenvolvimento (http://localhost:5173)
- `npm run build`: checagem de tipos (`tsc -b`) + build de produção
- `npm test`: testes unitários (Vitest) da lógica em `src/game`. Roda via `scripts/vitest.mjs`, que normaliza a letra do drive no Windows (com `c:\` minúsculo o Vitest carrega duas vezes e todo teste falha com `reading 'config'`)
- `npm run test:watch`: Vitest em modo watch

Valide cada etapa com `npm run build` e `npm test`.

## Stack

Vite + TypeScript (strict, `noUncheckedIndexedAccess`), React 19, React Three Fiber + drei, `@react-three/postprocessing` (N8AO, bloom, ACES), Zustand, Tailwind CSS v4 (via `@tailwindcss/vite`, tema em `src/index.css`), Vitest. Gerenciador: npm. `@react-three/rapier` só entra numa fase futura.

## Estrutura

```
src/
  data/    Balanceamento e configuração (crops, animals, economy, world, camera, structures, workers, scale, roads). Sem lógica.
  game/    Lógica pura, sem React/three: grid, actions, growth, workers, animals, structures, roads, visitors, path, simulation, economy, time, save, state, dev (trapaças de teste), random. Testada em __tests__/.
  store/   gameStore.ts (Zustand): estado + ações que chamam game/*, mensagens de erro pt-BR.
  scene/   Componentes R3F: GameCanvas, CameraRig, Sky, DayNightLight, PostFx, Environment (relevo + florestas), TileLayer, SoilLayer (sulcos), GrassLayer, TileHighlight, TaskMarkers, Fences, RoadLayer, CropLayer, Structures, BuildGhost, Workers, Animals, Car, models/.
  ui/      HUD em React + Tailwind: TopBar, Toolbar, HoverInfo, ShopPanel, InventoryPanel, WorkersPanel, BuildPanel, PlotDialog, Toast, DevPanel, devTools, hooks/.
```

## Modelo do jogo

- `GameState` (`src/game/types.ts`): `gameMinutes`, `money`, `tiles: Tile[]` (array linear, `index = y * 32 + x`), `unlockedPlots`, `plotsPurchased`, `inventory { seeds, produce, products }`, `workers`, `tasks`, `animals`, `structures`, `nextId` (ids de trabalhadores, tarefas, animais e construções).
- `Tile.state`: `locked | grass | tilled | planted | watered`; `crop { cropId, growthMinutes }`; `wateredUntil`; `structure`; `road`.
- Terreno em lotes de 4×4 (8×8 lotes). Início: 2×2 lotes centrais (8×8 tiles), com a casa (2×2) no centro e a caixa de venda ao lado. Só é possível comprar um lote vizinho a outro já desbloqueado, e o custo cresce: `PLOT_BASE_COST * PLOT_COST_MULTIPLIER^comprados`.
- A planta só cresce enquanto está regada. A rega dura até o fim do dia de jogo e depois o tile volta para `planted`. O estágio visual (0–2) é derivado de `growthMinutes` e nunca é salvo.
- Tempo: 1 dia = 1440 min de jogo = `DAY_LENGTH_REAL_MINUTES` (25) min reais em 1×. `advanceGame` (`simulation.ts`) avança crescimento, trabalhadores e salários. O crescimento é processado em passos de `GROWTH_STEP_MINUTES`, então o array `tiles` só muda nesses passos ou quando uma tarefa termina.
- Trabalho: o clique não age na hora, ele enfileira uma tarefa (`toggleTask`; clicar de novo com a mesma ferramenta cancela). A validação usa `projectTasks`, o estado futuro com a fila aplicada, então dá para enfileirar arar e plantar no mesmo tile, e as sementes ficam reservadas. Tarefas do mesmo tile rodam em ordem. Cada trabalhador ocioso pega a tarefa disponível mais próxima, anda até ela por A* (`path.ts`, desviando de construções e de terra bloqueada) e trabalha `TASK_MINUTES / efficiency`. Trabalham das 6h às 20h e depois voltam para casa. A família (3 pessoas, `FAMILY`) é gratuita; contratados custam `HIRE_COST` e `DAILY_WAGE` à meia-noite, e quem não recebe vai embora.
- Construções (`data/structures.ts`, `game/structures.ts`): `structures` guarda as instâncias (`type`, canto superior esquerdo `x/y`, `rotation` 0–3; rotação ímpar troca largura e profundidade), e os tiles cobertos recebem `Tile.structure`, que bloqueia caminho, pasto e ferramentas. Só se constrói em grama desbloqueada, sem construção e sem tarefa na fila. Quem estiver na área é empurrado para fora. Casa e caixa de venda não têm `cost`, então não podem ser construídas nem demolidas. Demolir devolve `DEMOLISH_REFUND`. A UI tem o modo de construção (`buildMode` no store, painel B, R gira, Esc sai) e o fantasma `BuildGhost`. Por enquanto a obra é instantânea.
- Estradas (`data/roads.ts`, `game/roads.ts`): `Tile.road` fica em tile `grass` (ou `locked`, no caso da estrada de acesso). A estrada de acesso é fixa: sai do lado da caixa de venda (18, 16) e segue até a borda norte (`ACCESS_ROAD_EDGE`), continuando `OFFMAP_ROAD_LENGTH` tiles fora do mapa por um corredor de terreno aplainado (`terrain.ts`). O jogador constrói estrada em grama própria e livre (`ROAD_COST`, modo `road`, clique e arraste) e remove pelo modo demolir; o trecho fora da fazenda não pode ser removido. Estrada bloqueia ferramentas, construções e pasto, abre portão na cerca e faz a equipe andar `ROAD_WALK_BONUS` mais rápido.
- Carro (`game/visitors.ts`): é derivado do relógio e das estradas e nunca é salvo. Nos `CAR.visitHours`, uma picape vem do fim da estrada fora do mapa, segue as estradas (BFS a partir da entrada), estaciona no tile de estrada alcançável mais perto da caixa de venda, espera `CAR.waitMinutes` e volta até sumir na névoa, freando e acelerando nas pontas. Por enquanto é só visual; ligar com vendas e pedidos fica para o hub.
- Ações retornam `ActionResult` (`{ ok, state } | { ok: false, error }`). Os códigos de erro viram texto pt-BR em `ERROR_MESSAGES` (store).
- Animais (`data/animals.ts`, `game/animals.ts`): galinha, pata, porco, ovelha, cabra, vaca, boi e cavalo. Pastam só em tiles `grass` desbloqueados e sem construção, passeiam com pausas e dormem das 21h às 5h. A ração é cobrada à meia-noite junto com os salários, e animal sem ração não produz no dia seguinte. O produto fica pronto no animal (`hasProduct`) e é coletado com um clique, indo para `inventory.products`. Boi e cavalo não produzem, mas dão bônus à equipe (`laborMultipliers`): aração e caminhada mais rápidas, com teto em `LABOR_BONUS_CAP`.
- Dev: em `npm run dev` (ou em qualquer build com `?dev` na URL) há o painel 🛠️ (F2) e `window.dev` no console (`dev.help()`). As funções ficam em `game/dev.ts` e passam pelo `devApply` do store. `devTimeScale` multiplica a velocidade e não é salvo.
- Save: `localStorage['uvalley.save']`, `saveVersion` (atual 5; a migração 1→2 adiciona a família, a 2→3 adiciona animais e produtos, a 3→4 adiciona `structures` e a 4→5 adiciona a estrada de acesso em tiles livres), validação manual sem `any` em `save.ts`. As configurações incluem `graphics: 'high' | 'low'`. Para mudar o formato, incremente `SAVE_VERSION` e adicione uma entrada em `migrations`. Há autosave a cada 30 s, no `beforeunload` e no `visibilitychange`.

## Convenções

- Código e identificadores em inglês; **textos da interface em português (pt-BR)**.
- Sem `any`. Componentes pequenos.
- Balanceamento (custos, tempos, preços) só em `src/data/`, nunca hardcoded em componentes. Cores visuais ficam em `scene/palette.ts` e nos modelos.
- Lógica do jogo em `src/game/` como funções puras `(state, args) => result`, sem importar React/three. Escreva testes Vitest para regras novas.
- Desempenho:
  - Elementos repetidos usam `InstancedMesh` (tiles, plantas, cercas, árvores).
  - Use seletores finos do Zustand: selecione primitivos ou referências estáveis e nunca o objeto `game` inteiro, que muda a cada frame.
  - Dentro de `useFrame`, leia com `useGameStore.getState()` em vez de hooks.
  - `GameCanvas` é estático: mudanças do HUD não podem re-renderizá-lo.
- Visual: céu em gradiente (`Sky.tsx`) e névoa com a cor do horizonte; sol em arco com hora dourada e lua (`DayNightLight`); janelas e lampião emissivos à noite (`materials.ts`). No modo alto há pós-processamento (`PostFx`): AO, bloom e ACES. Vento por `applyWind` (`wind.ts`, `onBeforeCompile`) em grama, plantas e árvores.
- Escala real (`data/scale.ts`): 1 tile = `TILE_METERS` (3,5 m) e todo tamanho visual é dado em metros e convertido com `meters()`. Pessoas (altura por membro da família e variação nos contratados), animais (`ANIMAL_SIZES`: altura e comprimento), plantas (`CROP_HEIGHTS`), cerca, grama e caixa de venda são ajustados a esses valores. Construções novas são modeladas direto em metros dentro de `<Meters>` (`models/Buildings.tsx`). A casa e as árvores já foram feitas nessa escala. Ao criar um modelo, use medidas reais (porta ≈ 2,1 m, galinha ≈ 0,45 m).
- Arte low-poly procedural: primitivas + `flatShading`. Modelos multicoloridos são mesclados com vertex colors (`scene/models/geometry.ts`) para caber num único `InstancedMesh`. Para trocar por glTF (Kenney/Quaternius), substitua o builder/componente em `scene/models/` usando `useGLTF`.
- Em dev, o store fica exposto como `window.__uvalley` para depuração no console.

## Roadmap

- Fase 1 (feita): cena, câmera, grid, ferramentas, 3 culturas, economia, loja, inventário, compra de lotes, dia/noite, velocidade, save/load.
- Fase 1.5 (feita): câmera perspectiva orbital, dia de 25 min, família + contratados com fila de tarefas, visual com iluminação, sombras e pós-processamento.
- Fase 2a (feita): animais com pasto, produção, ração, bônus de trabalho; painel e console de dev.
- Fase 2b (em andamento): B1 feita (construir/demolir galinheiro, silo, armazém e celeiro), escala real (`data/scale.ts`), item A feito (estrada de acesso, carro visitante, construção de estradas). Próximas: obra feita pelos trabalhadores, abrigos com capacidade (B2), armazenamento com limite (B3), coleta de produtos pelos trabalhadores, clima/estações e missões.
