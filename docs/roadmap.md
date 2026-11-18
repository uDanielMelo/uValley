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

### Etapa 2: obra feita pelos trabalhadores
Construir vira tarefa e usa a habilidade Construção. Pré-requisito dos upgrades de abrigo.

### Etapa 3: animais e abrigos (seção 4)
Raças, estrelas, ciclo de vida (filhote, jovem, adulto, idoso), lotação por quadrante (lote 4×4),
abrigos por espécie (curral, aprisco, galinheiro, chiqueiro, estábulo) com 4 níveis (básico, reforçado,
confortável, automatizado) e suas particularidades, saúde e remédios, predadores, esterco como adubo.

### Etapa 4: armazenamento e clima
Capacidade por construção, intempéries e estações, perda e conservação por nível, refrigeração.

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
- Pata e boi: ficam, saem, ou o boi vira raça de tração?
- Carne e couro: haverá abate?
- Números de balanceamento: propostas iniciais ficam em `src/data/` e são ajustadas jogando.
- As habilidades "Tratar animais" e "Construção" e as especialidades de animal já existem nos
  trabalhadores, mas só têm efeito quando houver tarefas de obra (etapa 2) e de animais (etapa 3).

## Skills de apoio (instaladas globalmente)

`threejs-performance`, `threejs-shaders`, `threejs-interaction`, `threejs-react-three-fiber`,
`threejs-game-ui-designer`, `vitest`, `playwright-cli`. Para a Etapa 8: `supabase/agent-skills@supabase`.
