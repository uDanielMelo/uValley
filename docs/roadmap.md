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
- **3d, saúde e predadores** ✅: doença por hora (conforto, lotação, fome, idade), incubação percebida antes
  por quem tem a habilidade, remédio comprado e tarefa de medicar, visual de doente. Predador à noite por
  abrigo, com chance × (1 − segurança). Sorteios determinísticos (`hash01`). Feito: verminose, gripe (contagiosa)
  e infecção, mais o ferimento de predador; sem remédio, gripe, infecção e ferimento matam. Vermífugo e antibiótico
  na loja, medicar e recolher carcaça viram tarefas automáticas de Tratar animais. Predadores atacam todos os
  abrigos à noite (mais animais e animais fora do abrigo atraem mais; filhotes são alvo preferido): comem os
  pequenos e filhotes (a carcaça fica no chão e aumenta a chance de infecção) e ferem os grandes. Evento raro.
  Save v11.
- **3e, esterco e adubo** ✅: esterco no abrigo, coletado pela equipe, e adubar acelera ou melhora a planta
  (versão simples; a etapa 7 amplia). Feito: esterco por animal no abrigo (fração, teto por vaga; a
  esterqueira do chiqueiro nível 3 dá +50%), recolhido como adubo pela coleta; abrigo cheio de esterco adoece
  mais. Atividade Adubar (tecla 5): +30% de crescimento e 35% de chance de uma unidade extra na colheita; o
  adubo também é vendido na loja. Decisões tomadas por mim com a autonomia dada pelo usuário. Save v12.

### Etapa 4: armazenamento e clima ✅
O celeiro guarda produtos agrícolas e animais. Capacidade por construção, intempéries e estações, perda e conservação por nível, refrigeração.

Feito (decisões tomadas por mim com a autonomia dada pelo usuário):
1. Capacidade: despensa da casa 30, silo 80 só de grãos, armazém 60, celeiro 100 e a nova câmara fria 30
   (refrigerada). Sementes, remédio e adubo não ocupam espaço.
2. Estragos à meia-noite: tomate, ovos, leite e trufa perdem uma fração por dia (trigo e lã não); no silo e na
   câmara fria nada estraga; o que não cabe fica ao relento e perde 25% ou mais por noite.
3. Estações de 7 dias (primavera, verão, outono, inverno): crescimento ×1,15 / ×1,1 / ×1 / ×0,6 e estragos
   ×1 / ×1,5 / ×1 / ×0,6.
4. Clima do dia (sol, nublado, chuva, tempestade) sorteado pela estação, sem salvar: a chuva rega a lavoura e
   a tempestade destrói 12% das plantas em crescimento. No inverno a chuva vira neve.
5. Visual: céu cinza, luz mais fraca, relâmpagos, chuva e neve, paisagem tingida pela estação. Sem mudança no
   formato do save (tudo é derivado).

### Etapa 5: centro comercial (segundo ambiente) ✅
Troca de cena fazenda ↔ cidade, lojas clicáveis, peso dos itens e capacidade do veículo (upgrade),
entregas pelo carro, contratação na cidade, vendas e pedidos.

Feito (decisões tomadas por mim com a autonomia dada pelo usuário):
1. Cidade como segunda cena (tecla C ou botão no Dock): uma rua com sete lojas clicáveis. O jogo continua
   correndo; a fazenda é desmontada e remontada na volta.
2. Mercado: o jogador carrega o veículo com colheita e produtos (peso por unidade); a picape é o veículo da
   fazenda e leva a carga 30 min depois de cada visita (7h, 12h e 18h). A cidade paga 25% a mais que a caixa
   de venda, que continua vendendo na hora pelo preço base.
3. Pedidos: padaria, restaurante, ateliê e laticínio pedem lotes com prazo de 2 a 4 dias e pagam 1,6 a 2,1×
   o preço base; a carga que cobre um pedido inteiro o atende primeiro.
4. Veículo: picape 250 kg, caminhonete 600 kg (3.500) e caminhão 1.500 kg (9.000), trocados na
   concessionária; a cor e o tamanho do carro na estrada mudam.
5. Contratação e compras: a agência abre a equipe e as lojas abrem as abas da loja (que continua acessível
   pelo topo). Save v13.

### Etapa 6: hub de construção em planta baixa ✅
Visual azulado de projeto ao construir estradas e prédios, compra de decoração e iluminação.

Feito (decisões tomadas por mim com a autonomia dada pelo usuário):
1. Planta: com o painel Construir aberto ou algo sendo posicionado, a fazenda ganha papel azul, grade de
   tiles e de lotes e o contorno de cada construção; a câmera inclina para uma vista de cima e volta depois.
2. Decoração e iluminação (nova categoria): poste de luz 90, canteiro 40, banco 50, espantalho 60, árvore 30
   e chafariz 450. São obras da equipe, como as outras construções.
3. O poste acende à noite (brilho no chão) e protege: abrigos a até 4 tiles ganham +10% de segurança contra
   predadores, até +20%. Sem mudança no save.

### Etapa 7: plantações 2.0 ✅
Pesquisa de culturas, culturas de campo e de estrutura (estufa, pomar), adubo, habilidade por cultura.

Feito (decisões tomadas por mim com a autonomia dada pelo usuário):
1. Seis culturas novas: cenoura, batata e abóbora (lavoura), morango (só na estufa), laranjeira e macieira
   (pomar: sem rega, frutificam de novo depois da colheita). Cada cultura tem uma estação em que cresce 25%
   mais rápido.
2. Pesquisa: as culturas novas custam de 300 a 1.800 e levam de 12 a 42 horas de jogo, uma por vez (aba
   Sementes da loja).
3. Estufa (3×2, 900): cobre tiles que continuam plantáveis, rega sozinha, ignora a estação e a tempestade.
4. Habilidade por cultura: aprendiz, experiente e mestre (15, 50 e 120 tarefas) dão até +30% de ritmo e +15%
   de efetividade naquela cultura. O adubo já tinha sido feito na 3e. Save v14.

### Etapa 8: GitHub e social (parte local ✅)
Backend (ex.: Supabase com login GitHub), save na nuvem, perfis e amigos, impacto de contribuições na
fazenda com teto (para não premiar commits vazios).

Feito (decisões tomadas por mim com a autonomia dada pelo usuário):
1. Perfil (🐙 no topo): o jogador liga um usuário do GitHub; o jogo lê a atividade pública e conta os dias com
   contribuição nos últimos 7 (não o número de commits). Cada dia dá +2% no crescimento das plantas e na
   produção dos animais, até 5 dias (+10%). Sincroniza no máximo a cada 30 min.
2. Save em arquivo: exportar e importar a fazenda.
3. Nuvem: cliente pronto (save, cards públicos de fazenda e login GitHub pelo Supabase Auth), desligado até
   configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. SQL e passo a passo em `docs/supabase.md`.
   Save v15.

Falta (depende do usuário criar o projeto Supabase e o OAuth App do GitHub): testar o login e a nuvem de
verdade e fazer o sistema de amigos (seguir e visitar fazendas).

### Vias e mapa maior (pedido do usuário) ✅

Decidido com o usuário:
1. Mapa 64×64 (16×16 lotes). A fazenda começa com 32×32 tiles (8×8 lotes), centrada e encostada na borda
   sul, perto da rodovia; o pátio (casa, caixa de venda, alojamento) fica de frente para uma rua junto da
   estrada de acesso, que ficou com 4 tiles fora do mapa até a rodovia.
2. Anel de rua automático: toda construção, menos decoração, precisa de 1 tile livre em volta; a obra paga
   e enfileira a rua do anel (5 por tile novo), e vizinhos dividem a mesma rua.
3. Só funciona ligada: alojamento, abrigos e armazéns sem estrada até a estrada de acesso ficam parados
   (aviso no card, no toast e no selo 🚧). Casa, caixa de venda, decoração e estufa não dependem disso.
4. Saves antigos (mapa 32×32) não carregam: começa uma fazenda nova, com aviso. Save v16.

Decidido por mim: estradas desenhadas por peça (reta, curva em quarto de anel, T e cruzamento com cantos
arredondados, ponta), com acostamento e trilhos de roda; o carro faz as esquinas em arco e estaciona na
frente da caixa de venda; a equipe prefere as ruas no A* e segue as curvas; o arraste de estrada preenche os
tiles pulados; `placeStructure` (dev) liga sozinho uma rua até a rede.

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
