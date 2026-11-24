# Cercas construídas pelo jogador (etapa 10a)

Pedido do usuário em 2026-11-24; abordagem B escolhida por ele na conversa.

## Intenção

- Cercar o pasto para os animais se movimentarem só lá dentro. Com a porteira aberta, eles podem sair.
- Poder construir na diagonal, para a fazenda não ficar toda em quadrados.
- Construção por clicar, arrastar e soltar, mostrando antes o custo em dinheiro e os materiais (madeira, arame etc.).

## Objetivos

- Modo de construção de cerca com arraste (reta e diagonal de 45°) e o fantasma com custo e materiais.
- Cerca como obstáculo para animais, equipe e ferramentas, sem deixar vazamento nas diagonais.
- Porteira (abrir/fechar com a Mão).
- Animais que ficam fora de uma área fechada voltam para dentro.
- Demolir e cancelar com reembolso, como estradas.

## Não objetivos

- Ângulos que não sejam múltiplos de 45°.
- Estoque de madeira e arame: os materiais são só o detalhamento do preço.
- Mudar a capacidade do pasto, o `LEASH_RADIUS` ou a produção por causa da cerca.
- Mexer na cerca automática da borda da terra comprada nem nas cercas desenhadas dentro dos modelos dos abrigos.
- Automatizar a porteira (abrir de manhã, fechar à noite).

## Anti-objetivos

- Animal preso do lado de fora sem saída, ou preso numa área sem abrigo para ir.
- Diagonal que deixa um vão por onde passa animal ou pessoa.
- Cerca que bloqueia a estrada de acesso ou a rede de ruas.

## Restrições do projeto

- Lógica pura em `src/game/`, balanceamento em `src/data/`, testes Vitest, textos em pt-BR, sem `any`.
- Instâncias repetidas em `InstancedMesh`.
- Mudar o formato do save exige `SAVE_VERSION` 23 e uma entrada em `migrations`.

## Abordagens consideradas

- **A, segmentos livres entre dois pontos:** o mais flexível, mas o bloqueio vira teste de interseção de linhas, achar a área cercada é difícil e o save fica pesado.
- **B, cerca por tile ligada aos 8 vizinhos (escolhida):** reaproveita A*, tarefas da equipe, save por tile e o arraste com `tileLine` das estradas. A diagonal é uma escada de tiles; o interior é achado por preenchimento em 4 direções, que não vaza.
- **C, nas arestas dos tiles, só reta:** simples, mas sem diagonal.

## Desenho (abordagem B)

### Dados e save

- `Tile.fence?: { gate?: boolean; open?: boolean }`. Sem campo = sem cerca. Só em tile `grass` desbloqueado, sem construção, sem estrada e sem planta.
- A cerca bloqueia: caminho da equipe (A*), ferramentas, construções e estradas, e o movimento dos animais. Porteira aberta não bloqueia; fechada bloqueia.
- Movimento diagonal entre dois tiles só é permitido se nenhum dos dois tiles que dividem aquele canto tiver cerca fechada; assim a escada não deixa vão.
- Save v23: migração v22→v23 não muda nada (campo opcional).
- `data/fences.ts`: custo por tile (reta e diagonal, esta × √2 em material), receita de materiais por tile (madeira, arame, pregos etc.), minutos de obra por tile.

### Construção (`game/fences.ts`)

- Modo `fence` no `buildMode` do store, com painel Construir. Clicar e arrastar escolhe o ponto inicial e o fim; a linha é a de `tileLine`, com o ângulo forçado ao múltiplo de 45° mais próximo do arraste (reta ou diagonal).
- Ordenar paga na hora o custo total e enfileira uma tarefa `build` por tile com `job: { type: 'fence', gate?: boolean }`, como as estradas. Cancelar devolve; demolir pelo modo demolir gera tarefa de remoção e reembolso `DEMOLISH_REFUND`. "Cancelar todas" também cancela cercas.
- Um modo/ferramenta "Porteira" põe a porteira num tile de cerca existente ou numa linha nova (um tile). Porteira começa fechada.
- Erros novos: `no-room-for-fence` (tile ocupado ou bloqueado), `fence-blocks-road` (fechar a rede de ruas ou a estrada de acesso).

### Fantasma e UI

- Durante o arraste, `BuildGhost` mostra as peças (azul se válido, vermelho se não) e um cartão no cursor: nº de tiles, dinheiro total (vermelho se faltar) e a lista de materiais (ex.: "Madeira 12, Arame 3 rolos").
- Clicar na porteira com a Mão abre/fecha na hora (ação do store, sem tarefa). Cursor e dica ("Abrir porteira").

### Cena

- `FenceLayer` novo (`InstancedMesh`): para cada tile com cerca, um poste no centro e, para cada vizinho (8 direções) com cerca, trilhos (2 alturas) do centro até o meio do vizinho; na diagonal, trilho inclinado. Porteira: duas folhas que giram (aberta) ou ficam fechadas. A cerca automática da borda continua em `Fences`.

### Animais

- Região de pasto do animal = tiles de pasto alcançáveis a partir da porta do abrigo andando em 4 direções, sem atravessar cerca fechada (porteira aberta conta como livre). `pickTarget` e `segmentClear` usam esse alcance; o `LEASH_RADIUS` continua valendo.
- Porteira fechada com animal fora da área: ele volta para dentro (o caminho de volta passa por onde existe passagem; se não existir, ele é levado ao tile livre mais perto de dentro da área). Vacas e bois não precisam entrar no abrigo: basta voltarem para dentro da área cercada; os demais voltam até o abrigo.
- Porteira aberta: o animal pode sair, vagar até o `LEASH_RADIUS` e voltar de noite como hoje.
- Predadores: animal fora da área fechada à noite segue contando como fora do abrigo.

## Decisões minhas a confirmar

1. Só 0°/45°/90° (múltiplos de 45°).
2. Materiais só detalham o preço; sem inventário.
3. Porteira abre/fecha na hora e sem custo.
4. Vacas e bois: "não precisam entrar no abrigo" foi lido como ficar dentro da área cercada, sem exigir o abrigo, só nessa regra de voltar à área. À noite continuam dormindo dentro, como hoje.
5. Cerca não pode ser colocada em cima de planta, construção ou estrada, nem cortar a rede de ruas.

## Sub-etapas

- 10a-1 (lógica e testes): `data/fences.ts`, `Tile.fence`, `game/fences.ts` (validar, ordenar, cancelar, demolir, achar área), bloqueio em A* e ferramentas, save v23.
- 10a-2 (animais): região de pasto e retorno à área, testes.
- 10a-3 (cena e UI): `FenceLayer`, fantasma com custo e materiais, modo porteira, clique para abrir/fechar, dev (`dev.fence()`), CLAUDE.md e roadmap.

Cada sub-etapa passa por `npm run build` e `npm test`.
