# Roadmap do uValley

Plano de execução derivado de "Etapas de Desenvolvimento uValley". Cada etapa é uma entrega fechada:
branch própria, `npm run build` e `npm test` passando, migração de save quando o formato mudar.

## Direção do jogo

- **Gênero**: simulador de fazenda com gestão. O jogador administra pessoas, animais, construções e
  logística em vez de trabalhar com as próprias mãos (mais perto de um tycoon do que de um jogo de ação).
- **Nicho**: jogo de navegador, de sessão curta, para quem vive no GitHub. A integração com o GitHub
  adiciona camada social (amigos) e bônus de jogabilidade, mas só depois do jogo base estar sólido.
- **Loop central**: manter a fazenda e fazê-la crescer, com profundidade em três frentes:
  pessoas (seção 3), animais e abrigos (seção 4) e logística/economia (centro comercial, peso,
  armazenamento, intempéries).

## O que o documento muda no jogo atual

| Documento | Jogo antes | Etapa |
|---|---|---|
| Estrada de acesso desce para o sul até a rodovia | Estrada para o norte | 0 |
| Clicar e arrastar uma área para criar atividades | Clique tile a tile | 0 |
| Alojamento com 3 vagas, trabalhadores (sem família) | Família de 3 gratuita | 1 |
| Pagamento por hora e custo de demissão | Salário diário à meia-noite | 1 |
| Raças, abrigos por espécie com 4 níveis | Sem raças, galinheiro/silo/armazém/celeiro | 3 |

## Etapas

### Etapa 0: alinhar a base ao documento ✅
1. Estrada de acesso para o sul, terminando numa rodovia leste-oeste fora do mapa. O carro chega pela
   rodovia, entra na estrada e vai embora pelo outro lado.
2. Seleção por área (clicar e arrastar) para arar, plantar, regar e colher, com prévia do retângulo.
   Começar o arraste num tile com a mesma ordem cancela a área.
3. Save v6 com migração.

### Etapa 1: pessoas e gestão (seção 3) ✅
1. Trabalhador com **idade** (18–19, 20–35, 36–50, 51+ → velocidade × efetividade), **estrelas 1–3**,
   **habilidade geral** (plantio, animais, construção) e **habilidade específica** (uma cultura ou um animal).
2. **Efetividade**: chance de colheita extra. Velocidade: tempo de cada tarefa.
3. **Alojamento** (construção) com 3 vagas por unidade. Sem vaga não há contratação fixa.
4. **Contratação por painel**: candidatos renovados todo dia. Salário por hora de expediente, custo de
   contratação e custo de demissão (rescisão).
5. **Esporádicos**: diária cara, atributos aleatórios, sem vaga no alojamento, vão embora às 20h.
6. **Atribuições e prioridades** por trabalhador (clicar no trabalhador abre a ficha).
7. **Hub de gestão** com equipe, contratação e folha.

### Etapa 2: obra feita pelos trabalhadores ✅
1. Construir, demolir e abrir ou remover estrada viram tarefas da atividade **Obras** (habilidade Construção).
2. A ordem paga na hora e reserva a área; cancelar devolve tudo. A demolição devolve 50% ao terminar.
3. Equipe de até 3 por obra, cada um num lado da construção; o progresso fica na obra e atravessa a noite.
4. Construção em obra ou em demolição não funciona (camas do alojamento, porta de descanso).
5. Canteiro na cena (chão de terra, andaime, prédio translúcido que firma com o progresso, barra), pose
   de martelar, card de hover com % e equipe, aviso ao concluir. Save v7 com migração.
6. `work.kind` já prevê `'upgrade'` para os níveis de abrigo da etapa 3.

### Etapa 3: animais e abrigos (seção 4)
Grande demais para uma entrega: dividida em sub-etapas, cada uma com branch e versão de save.

- **3a, abrigos e lotação** ✅: galinheiro (galinha e pata), aprisco (ovelha e cabra), curral (vaca e boi),
  chiqueiro (porco) e estábulo (cavalo). O animal pertence a um abrigo (compra só com vaga), pasta perto
  dele e dorme dentro. Lotação por lote 4×4 em unidades animais (ex.: 4 vacas ou 12 galinhas). O produto
  fica no abrigo e a **coleta vira tarefa** da equipe (habilidade animais e especialidade); o clique
  direto sai. O celeiro deixa de ser abrigo. Lotação: o pasto da fazenda soma 12 unidades por lote de
  grama livre (galinha 1, ovelha e cabra 2, porco, vaca, boi e cavalo 3); comprar além disso é
  bloqueado, e acima da capacidade a produção cai. Save v8.
- **3b, níveis** ✅: básico, reforçado e confortável (conforto e segurança); cada nível dá mais vagas e
  estoque, e o conforto acelera a produção. O upgrade é obra (`work.kind = 'upgrade'`), pago na ordem
  (60% / 100% do custo do abrigo) e o abrigo segue funcionando. Tela no galinheiro (+segurança), esterco
  melhor no chiqueiro (texto; efeito na 3e). **O automatizado (nível 4, ordenhadeira etc.) ficou para
  depois**; o estábulo vai só até o 3. Junto: HUD minimalista, modo Mão (arrastar com o esquerdo move a
  câmera, clique seleciona estrutura e abre o card), hub de atividades. Save v9.
- **3c, raças, estrelas e ciclo de vida** ✅: fase derivada da idade (nunca salva). Curva de produção por
  fase. **O animal morre de velhice** no fim do ciclo. Sem reprodução por enquanto. Feito: 2 raças por
  espécie (comum e nobre), estrelas 1–3, filhote 12 h → jovem 12 h → adulto 48 h → idoso 24 h (tempo real
  em 1×), compra de filhote ou adulto, venda pelo card do animal. Save v10.
- **3d, saúde e predadores**: doença por hora (conforto, lotação, fome, idade), incubação percebida antes
  por quem tem a habilidade, remédio comprado e tarefa de medicar, visual de doente. Predador à noite por
  abrigo, com chance × (1 − segurança). Sorteios determinísticos (`hash01`).
- **3e, esterco e adubo**: esterco no abrigo, coletado pela equipe, e adubar acelera ou melhora a planta
  (versão simples; a etapa 7 amplia).

### Etapa 4: armazenamento e clima
O celeiro guarda produtos agrícolas e animais. Capacidade por construção, intempéries e estações, perda e conservação por nível, refrigeração.

### Etapa 5: centro comercial (segundo ambiente)
Troca de cena fazenda ↔ cidade, lojas clicáveis, peso dos itens e capacidade do veículo (upgrade),
entregas pelo carro, contratação na cidade, vendas e pedidos.

### Etapa 6: hub de construção em planta baixa
Visual azulado de projeto ao construir estradas e prédios, compra de decoração e iluminação.

### Etapa 7: plantações 2.0
Pesquisa de culturas, culturas de campo e de estrutura (estufa, pomar), adubo, habilidade por cultura.

### Etapa 8: GitHub e social
Backend (ex.: Supabase com login GitHub), save na nuvem, perfis e amigos, impacto de contribuições na
fazenda com teto (para não premiar commits vazios).

## Decisões em aberto

- "Quadrante" = lote 4×4? (assumido que sim)
- Números de balanceamento: propostas iniciais ficam em `src/data/` e são ajustadas jogando.

## Decisões tomadas

- Demolir e estradas também são obra (etapa 2).
- Coleta de produtos animais é tarefa da equipe (etapa 3a).
- Sem abate: o animal morre de velhice. Sem reprodução por enquanto.
- Pata fica, no galinheiro com as galinhas. Boi fica como espécie de tração, no curral com as vacas.
- O celeiro é armazenamento de produtos agrícolas e animais (etapa 4), não abrigo.

## Skills de apoio (instaladas globalmente)

`threejs-performance`, `threejs-shaders`, `threejs-interaction`, `threejs-react-three-fiber`,
`threejs-game-ui-designer`, `vitest`, `playwright-cli`. Para a Etapa 8: `supabase/agent-skills@supabase`.
