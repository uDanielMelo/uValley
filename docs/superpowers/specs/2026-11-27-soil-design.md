# Solo, análise e talhões (etapa 11a)

Pedido do usuário em 2026-11-26/27, primeira etapa do foco em plantio. O que o usuário decidiu está marcado como **(usuário)**; o resto é *(decisão minha)* e pode ser corrigido.

## Intenção

- Hoje a terra é igual em todo lugar e arar é "clicar e pronto": acontece rápido demais **(usuário)**.
- O jogo deve premiar quem joga com cuidado: quem analisa a terra e planeja onde plantar colhe mais **(usuário)**.
- Inspiração: as visões de recursos do Cities: Skylines (petróleo, minério), uma vista própria do mapa que mostra onde é melhor plantar e onde é melhor fazer pasto **(usuário)**.

## Objetivos

1. **Solo sorteado no mapa** **(usuário)**: cada fazenda nova tem manchas de solo espalhadas ao acaso, fixas para sempre (o solo não se gasta, **usuário**, opção A).
2. **Bônus e castigo** **(usuário)**: cada cultura rende mais no solo certo e menos (ou morre) no errado. Quem planta por sorte no lugar certo ganha o bônus sem analisar **(usuário)**; a análise só revela onde ele está.
3. **Pasto também varia** com o solo.
4. **Arar demora**, e o tempo depende do solo **(usuário: "acontece muito rápido")**. O trator passa a economizar horas, não minutos.
5. **Agrônomo** **(usuário)**: nova habilidade no quadro de contratação; só quem a tem faz a atividade **Analisar solo**.
6. **Visão do solo** **(usuário)**: modo de mapa com camadas (tipo de solo, aptidão para plantio por cultura, aptidão para pasto) e legenda; lote não analisado aparece como "?".
7. **Talhões com nome** **(usuário)**: o jogador marca uma área, dá um nome e vê no card o resumo do solo e as culturas recomendadas.

## Não objetivos (ficam para etapas seguintes do plantio)

- Desgaste da fertilidade, rotação, pousio, calcário/acidez (o usuário escolheu solo fixo).
- Umidade do solo contínua, irrigação fixa, pivô central.
- Implementos do trator (plantadeira, pulverizador, distribuidor), manobra conforme o formato do talhão, compactação.
- Plano de safra automático por talhão (enfileirar arar → plantar → regar → colher sozinho).
- Qualidade/estrelas da colheita, ponto de colheita, pragas, geada.
- Análise de solo comprada na cidade (laboratório) *(decisão minha: o agrônomo é o único caminho por enquanto; o quadro garante que ele aparece, ver abaixo)*.

## Anti-objetivos

- Começo de jogo travado: com arar mais lento, a fazenda nova não pode ficar dias sem colher nada.
- Economia inflada: em média, plantar no escuro não pode render mais do que hoje.
- Análise obrigatória: sem análise o jogo continua jogável, só menos eficiente.
- Ruído salpicado: o mapa de solo tem que ser legível (manchas grandes), não um tabuleiro aleatório tile a tile.
- Perder o trabalho de horas de aração porque o expediente acabou.
- Save antigo que não carrega.

## Restrições do projeto

- Lógica pura em `src/game/`, balanceamento em `src/data/`, testes Vitest, textos em pt-BR, sem `any`.
- Seletores finos no Zustand; `GameCanvas` estático; elementos repetidos em `InstancedMesh`.
- Mudança de formato do save: `SAVE_VERSION` 25 com entrada em `migrations`.
- `src/game/` não pode importar de `src/scene/` (o ruído do solo é próprio, feito com `hash01` de `game/random.ts`).

## Abordagens consideradas

- **A. Solo derivado de uma semente (escolhida).** `GameState.soilSeed` é o único dado salvo; `soilAt(seed, tile)` calcula o tipo com ruído em manchas, com cache por semente (um `Uint8Array` de 64×64). Segue a convenção do projeto de derivar o que não muda (como `weatherOf(day)`), mantém o save leve e a migração trivial.
- **B. Solo salvo em cada `Tile`.** Permitiria mudar o solo depois, mas o usuário escolheu solo fixo; pesa o save e a validação de `save.ts` sem ganho.
- **C. Mapa fixo desenhado à mão.** Seria igual em toda fazenda nova; o usuário pediu sorteio.

O usuário deixou o "como" comigo; escolhi A *(decisão minha)*.

## Desenho

### 1. Tipos de solo (`src/data/soil.ts`)

Cinco tipos *(decisão minha; nomes e números são o ponto de partida do balanceamento)*:

| id | Rótulo | Aração (× tempo) | Pasto (× capacidade) | Cor no mapa (palette) |
|---|---|---|---|---|
| `terraRoxa` | Terra roxa | 1,0 | 1,2 | vermelho-tijolo |
| `clay` | Argiloso | 1,4 | 1,0 | marrom |
| `sandy` | Arenoso | 0,7 | 0,6 | areia |
| `floodplain` | Várzea | 1,2 | 1,5 | azul-esverdeado |
| `stony` | Pedregoso | 2,0 | 0,5 | cinza |

Afinidade de cada cultura com cada solo (`CROP_SOIL`), em cinco notas com multiplicador de colheita (`SOIL_RATINGS`): `great` Ótimo ×2 · `good` Bom ×1,5 · `neutral` Neutro ×1 · `poor` Fraco ×0,5 · `bad` Péssimo (a planta murcha).

| Cultura | Terra roxa | Argiloso | Arenoso | Várzea | Pedregoso |
|---|---|---|---|---|---|
| Trigo | ótimo | bom | neutro | péssimo | fraco |
| Milho | ótimo | neutro | fraco | péssimo | fraco |
| Tomate | bom | neutro | ótimo | fraco | péssimo |
| Cenoura | neutro | fraco | ótimo | fraco | péssimo |
| Batata | neutro | fraco | ótimo | péssimo | fraco |
| Abóbora | bom | ótimo | neutro | neutro | fraco |
| Laranjeira | ótimo | bom | neutro | péssimo | bom |
| Macieira | bom | ótimo | fraco | péssimo | neutro |
| Morango | (só estufa: ignora o solo) | | | | |

Meta de balanceamento (teste): para cada cultura de campo e pomar, o multiplicador médio sobre todos os tiles do mapa (péssimo conta 0) fica entre 0,85 e 1,1, em várias sementes. Quem planta no escuro colhe, em média, o que colhe hoje; quem analisa chega perto de ×2. O construtor ajusta a tabela ou a frequência dos tipos para bater a meta.

Também em `data/soil.ts`: frequência alvo de cada tipo, tamanho das manchas, tempos e custos da análise, salário extra do agrônomo.

### 2. Geração (`src/game/soil.ts`)

- `soilSeed: number` em `GameState`. Fazenda nova: sorteada na criação (a criação recebe a semente de fora, para os testes serem determinísticos). Save antigo: a migração v24→v25 deriva a semente do próprio save (por exemplo, um hash de `nextId` e `gameMinutes`), sem `Math.random` *(decisão minha)*.
- `soilGrid(seed): Uint8Array` (cache por semente) e `soilAt(seed, tileIndex): SoilId`. Ruído de valor em duas ou três oitavas, feito com `hash01`, com limiares escolhidos para bater a frequência alvo. Manchas típicas de 4 a 12 tiles de largura. A várzea tende a formar faixas (por exemplo, um ruído esticado num eixo), para lembrar baixada de rio; não precisa casar com o relevo da cena.
- Garantias do começo de jogo: a área inicial (x 16–47, y 32–63) tem pelo menos 3 tipos, e o campo inicial (ver 4) cai num solo pelo menos neutro para o trigo (se a semente não der, a geração força o tipo nesse retângulo).
- `cropRating(seed, tile, cropId): SoilRating` (estufa: sempre `neutral`) e `soilYield(rating): number`.

### 3. Colheita e murcha

- `harvest` (`actions.ts`) e a colheita da máquina passam a calcular as unidades base com o solo: `m = soilYield(rating)`; unidades = `floor(m)` + (1 se `hash01(...) < m − floor(m)`), com semente determinística (tile e minuto, como o adubo). Os extras de hoje (adubo, efetividade do trabalhador) somam em cima. Com nota Fraco pode vir 0.
- Pomar: cada colheita usa o solo do tile da árvore.
- **Péssimo**: quando a planta chega a 50% do crescimento, ela murcha: o tile volta para `tilled` (perde o adubo) e a muda é perdida. Os murchos do mesmo passo de crescimento viram um toast só ("3 pés de milho murcharam: solo péssimo"). O crescimento fica em `growTiles`, que ganha a semente (ou o grid) como argumento.

### 4. Arar demora

- `TASK_MINUTES.hoe` passa de 12 para **150** (2,5 h) × o fator de aração do solo do tile. Pedregoso na enxada: 5 h; com o trator (×5): 1 h. Sob a estufa o fator é 1.
- **O progresso fica na tarefa** *(decisão minha, obrigatório pelo anti-objetivo)*: `Task.done?: number` (minutos já trabalhados, a ritmo 1). Hoje `Worker.progress` zera quando o trabalhador larga a tarefa (fim do expediente, máquina voltando, troca de prioridade); para tarefas `hoe`, ao desatribuir, o progresso passa para `task.done`, e quem pega a tarefa continua de onde parou. As outras tarefas curtas continuam como hoje. `save.ts` valida `done` (número ≥ 0, só em `hoe`).
- **Campo inicial pronto** *(decisão minha, anti-objetivo do começo travado)*: a fazenda nova começa com um retângulo de 4×3 tiles já arado perto da casa (cabem as 12 sementes iniciais de trigo), em solo pelo menos neutro para trigo. Os saves antigos não mudam.
- Na cena, o tile em aração mostra o progresso: a grama vai rareando e o sulco aparece aos poucos (o progresso vem de `task.done` + o `progress` de quem está trabalhando). O jeito de desenhar fica com o construtor, desde que não crie um mesh por tile.
- Dica visual *(decisão minha, pode ser cortada)*: terra arada ganha um leve tom da cor do solo (terra roxa mais avermelhada, arenoso mais clara, várzea mais escura). Isso premia quem observa sem substituir a análise, já que só aparece depois de arar.

### 5. Pasto

- `plotPasture` (`shelters.ts`) soma, em vez de contar, a capacidade de cada tile de pasto: `PLOT_PASTURE_UNITS / 16 × fator de pasto do solo`. `pastureCapacity` e quem a chama passam a receber `soilSeed` (o `Pick` ganha o campo).
- A lotação (`crowdingFactor`) e o resto continuam iguais.

### 6. Agrônomo e a atividade Analisar solo

- `SKILL_IDS` ganha `agronomy` (🔬 Agronomia), com peso baixo em `SKILL_WEIGHTS` e `AGRONOMY_WAGE` somado ao salário (como `MACHINERY_WAGE`).
- `TaskKind` ganha `survey` (Analisar solo), habilidade `agronomy`. Só quem tem a habilidade pega essa tarefa (como o operador de máquina). `DEFAULT_PRIORITIES` ganha `survey`; a migração acrescenta `survey` às prioridades dos trabalhadores salvos (no fim da lista) *(decisão minha)*.
- **O quadro garante um agrônomo** *(decisão minha)*: na renovação da meia-noite, se nenhum fixo da equipe tem Agronomia e nenhum candidato a tem, um dos candidatos sorteados ganha a habilidade.
- **Unidade da análise: o lote 4×4** *(decisão minha)*: o mapa já é dividido em lotes, e analisar tile a tile seria microgerência. `GameState.surveyedPlots: number[]` guarda os lotes analisados (índice de `plotIndex`).
- **Pode analisar** lote desbloqueado ou lote à venda vizinho a um desbloqueado (o mesmo vizinho que pode ser comprado), para ajudar a decidir qual comprar. Como a terra à venda não é andável, o agrônomo trabalha no tile andável mais próximo do centro do lote, dentro dele ou encostado nele.
- Ordem: `orderSurvey(state, plot)` paga `SOIL_SURVEY.cost` (kit de amostras, por lote) e cria uma tarefa `survey` com `job: { type: 'survey', plot }`; `SOIL_SURVEY.minutes` de trabalho (ponto de partida: 120). Clicar de novo num lote na fila cancela e devolve. "Cancelar todas" devolve também. Erros novos em `ERROR_MESSAGES` (já analisado, não pode analisar este lote, sem dinheiro, sem agrônomo na equipe: o último é só aviso, a ordem fica na fila).
- A tarefa `survey` não muda o tile, então não entra na ordem "tarefas do mesmo tile rodam em ordem" nem em `projectTasks` (como os carregadores, que não disputam tile): uma análise não espera a aração do mesmo tile, nem a bloqueia.
- Ao terminar: o lote entra em `surveyedPlots` e o toast avisa ("Análise do lote pronta: terra roxa e argiloso").

### 7. Visão do solo (UI e cena)

- Store: `infoView: 'soil' | null` e `soilLayer: 'type' | 'crop' | 'pasture'`, mais `soilCrop: CropId` para a camada de plantio (não salvos). Tecla própria (o construtor escolhe uma livre; hoje estão ocupadas C, H, L, I, T, V, B, R, Q, E, 1–5, espaço e as do `CameraRig`) e um botão 🔬 Solo na barra inferior. Esc sai. Abrir a visão fecha o modo de construção e vice-versa.
- Painel lateral da visão: abas **Tipo de solo**, **Plantio** (chips das culturas conhecidas; mostra a nota daquela cultura) e **Pasto**; legenda com as cores; contagem de lotes analisados; ferramentas **Analisar** (clicar ou arrastar sobre lotes enfileira análises e mostra o custo) e **Novo talhão**.
- Cena: uma camada de quadrados coloridos semitransparentes sobre os tiles (um `InstancedMesh`, cor por instância), acima do terreno e abaixo das construções. Lote não analisado: cinza com hachura ou "?"; lote fora do alcance da análise: escurecido. A cena em volta fica dessaturada ou escurecida para as cores se destacarem, como nas visões do Cities: Skylines. A mudança de camada não pode re-renderizar o `GameCanvas`.
- `HoverInfo` com a visão aberta ou não: tile analisado mostra "Solo: Terra roxa · Milho: ótimo (×2)"; não analisado, "Solo: ? (peça uma análise ao agrônomo)".

### 8. Talhões

- `GameState.fields: Field[]`, `Field { id, name, x, y, w, h }` (retângulo em terra própria; não se sobrepõem) *(decisão minha: só retângulo nesta etapa)*. O id vem de `nextId`.
- Na visão do solo, a ferramenta **Novo talhão** arrasta um retângulo; ao soltar, pede o nome (padrão "Talhão N"). Talhão é só organização: não bloqueia ferramenta, obra, pasto nem caminho.
- Os nomes aparecem no chão dentro da visão do solo (rótulo por talhão; poucos, então não precisa de instancing).
- Clicar num talhão (na visão do solo) abre o **card do talhão**: nome (renomear), área em tiles, composição do solo (% de cada tipo, só dos tiles analisados, e quanto falta analisar), **ranking das culturas conhecidas** pelo multiplicador médio esperado nos tiles analisados, o que está plantado hoje, e a **última colheita** (unidades e efeito médio do solo). Botão para apagar o talhão.
- Para a "última colheita", o talhão guarda `lastHarvest?: { day, units, tiles }`, atualizado quando um tile dele é colhido *(decisão minha)*.

### 9. Save (v25)

- Novos campos: `soilSeed`, `surveyedPlots`, `fields`, `Task.done` (só `hoe`), `survey` em `TaskKind`, `agronomy` em `SkillId`, `job` `survey`.
- Migração v24→v25: semente derivada do save, `surveyedPlots: []`, `fields: []`, `survey` acrescentado às prioridades. Validação manual sem `any`, como hoje.

### 10. Dev

- `dev.soil()` analisa todos os lotes; `dev.agronomist()` contrata um agrônomo; `dev.soilSeed(n)` troca a semente (para testar mapas). Uma seção Solo no painel de dev.

### 11. Testes (Vitest)

- Geração determinística por semente; frequência dos tipos perto da alvo; manchas (a maioria dos tiles tem vizinhos do mesmo tipo); garantias da área inicial.
- Meta de balanceamento do multiplicador médio por cultura (várias sementes).
- Unidades colhidas por nota (com arredondamento determinístico), estufa neutra, murcha no péssimo aos 50%.
- Tempo de aração pelo fator do solo; progresso guardado na tarefa entre expedientes e entre trabalhadores; trator ×5 em cima.
- Pasto pelo fator do solo.
- Agrônomo: só ele pega `survey`; quadro garante candidato; ordem, custo, cancelamento e reembolso; lote vizinho à venda; lote fica analisado.
- Talhões: criar, sem sobreposição, renomear, apagar, última colheita.
- Migração v24→v25.

### 12. Documentação

- `CLAUDE.md` (modelo do jogo, estrutura, save v25) e `docs/roadmap.md` (etapa 11a e as próximas do plantio, listadas nos não objetivos).

## O que fica com o construtor

- O algoritmo exato do ruído e dos limiares, desde que bata as metas de frequência, de manchas e de balanceamento.
- O desenho do progresso de aração e do tom do solo arado.
- A tecla da visão do solo e o layout do painel e do card (seguindo o padrão dos painéis atuais).
- Os números finais de `SOIL_SURVEY`, `AGRONOMY_WAGE` e do peso da habilidade.
