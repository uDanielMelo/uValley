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

### Etapa 8: GitHub e social (adiada para o fim)
Backend, login GitHub, save na nuvem, perfis e amigos. Decidido com o usuário: só entra na parte final do
projeto, de forma web (requisição ao GitHub e atualização pela web). O que havia sido feito localmente
(bônus de contribuições, painel Perfil, save em arquivo e cliente Supabase) foi removido do código.

### Etapa 9: doca e frete ✅ (9a, 9b, 9c, 9d e 9e)
A caixa de venda vira uma doca com vagas; vender e comprar passam por veículos, frete e trabalho da equipe
(carregamento como obra). Desenho completo, decisões do usuário e sub-etapas 9a a 9e em
`docs/superpowers/specs/2026-11-23-dock-design.md` (aprovado pelo usuário em 2026-11-23).

9a ✅: a doca no lugar da caixa de venda (33, 57), com uma vaga de carro na rua à frente; clientes avulsos
vêm sozinhos (até 4 horários por dia, com chance), pedem um lote e esperam 2 h; o jogador manda carregar e
a equipe (atividade Carga, habilidade Construção, até 3 pessoas) soma progresso na viagem; carregado, paga
à vista. Prazo estourado no meio da carga: descarrega e perde 15% (pelo menos 1 unidade). A venda
instantânea saiu. Save v17. Decidido por mim (as dúvidas do spec): Carga usa Construção, prazo de 2 h,
avaria de 15%, a doca no lugar da caixa e o cliente só pede o que a fazenda conhece (de preferência o que
ela tem em estoque). Provisório até a 9b: a carga do Mercado continua sendo levada pelo relógio, sem carro
na cena (a 9b a troca por anúncios e frete).

9b ✅: venda por anúncio na doca (aba Vender: produto, quantidade e preço; indicador de procura). As ofertas
chegam entre 7h e 18h, mais vezes quanto mais barato frente ao preço da cidade e nunca a 1,6× ou mais, cabendo
na demanda do dia; valem 3 h. Fechar a oferta paga o frete (picape: 4 + 0,04/kg; caminhonete 12 + 0,03/kg;
caminhão 30 + 0,02/kg), separa a mercadoria e agenda o veículo, que só roda das 6h às 19h e tem 5 h para ser
carregado; chegando, a equipe carrega sozinha e o comprador paga no fim. Pedidos das lojas saem pela aba
Pedidos do mesmo jeito. Venda que cai devolve a mercadoria (menos a avaria) e o pedido, mas não o frete. O
Mercado virou vitrine de preços e pedidos; `cargo` e a coleta pelo relógio saíram. Save v18. Decidido por mim:
a referência dos anúncios é o preço da cidade (o "prêmio de mercado" do spec), o frete é pago ao fechar, a
carga do frete começa sozinha ao estacionar, o cliente avulso não vem enquanto há frete esperando vaga e a
estação ainda não muda a demanda (fica para a etapa de economia).

9c ✅: compras por frete. A loja tem carrinho (sementes, adubo, remédio, ração e animais) e "Pedir entrega"
paga a mercadoria e o frete; a entrega chega à doca e a equipe descarrega sozinha. Os animais reservam a
vaga no abrigo e o pasto desde o pedido e vêm num caminhão boiadeiro contratado (fixo + por cabeça, até 8).
Entrega não descarregada a tempo fica retida na cidade: novo frete para trazer, ou desistir com metade de
volta; animal retido custa o dobro da ração por dia e, depois de 2 dias, pode chegar com verminose. A ração
virou estoque (kg) comido à meia-noite, com pedido automático ligado por padrão (mantém 3 dias). Save v19.
Decidido por mim: ração com pedido automático (para não virar microgerenciamento), caminhão boiadeiro à
parte do veículo da fazenda, a compra só pode ser cancelada antes de o frete sair, e o remédio pedido do
card do animal vai direto, sem passar pelo carrinho.

9d ✅: a doca tem níveis, reformados pela equipe: nível 2 "Doca dupla" (segunda vaga de carro, 600) e nível 3
"Doca com caminhão" (vaga de caminhão, 1.600). As vagas novas ficam na rua, à direita da doca, pintadas no
chão (amarela a do caminhão), e a reforma abre a estrada delas. Cada veículo segura sua vaga e tem sua
própria equipe de carga. O frete escolhe o veículo pelo peso (o menor contratado em que a carga cabe) ou
sempre o que o jogador fixar na Concessionária, que agora contrata picape, caminhonete e caminhão; o
caminhão (1.500 kg, frete por kg mais barato) só vem com vaga de caminhão. Save v20. Decidido por mim: vagas
a duas casas uma da outra (a picape tem 5,2 m), animais comprados continuam vindo no boiadeiro em vaga de
carro, e carregadores de um mesmo veículo dividem o tile da vaga.

9e ✅: venda de animais vivos pelo curral de embarque (construção nova, 700, 3×2, com área de contenção para
10 cabeças e vaga de caminhão na rua em frente). No card do animal, "Separar para venda" faz a equipe (Tratar
animais) levar ele ao curral, onde espera sem produzir; no card do curral, "Chamar comprador" paga o frete do
boiadeiro (fixo + por cabeça, até 8) e o caminhão vem ao curral; a equipe embarca (Carga) e o comprador paga o
valor de cada animal na hora. Depois de 6 h no curral o animal perde 3% por hora (até 60%), e à noite o curral
fica aberto aos predadores. A venda instantânea de animais saiu. Save v21. Decidido por mim: o boiadeiro para
na vaga do próprio curral (não precisa da vaga de caminhão da doca), a condução é uma tarefa de Tratar animais
e o embarque usa a Carga, e um animal na lista do caminhão não pode mais ser tirado da venda.

### Etapa 10a: cercas e porteiras ✅ (pedido do usuário)
Cercas construídas pelo jogador para fechar o pasto, com diagonal a 45° para a fazenda não ficar toda quadrada.
Desenho e plano em `docs/superpowers/specs/2026-11-24-fences-design.md` e `docs/superpowers/plans/2026-11-24-fences.md`.

Feito: cerca por tile (`Tile.fence`) ligada aos 8 vizinhos; clicar, arrastar e soltar traça a linha (0°, 45° ou 90°),
com cartão de tiles, moedas e materiais (poste, tábua, arame, dobradiça) que só detalham o preço: reta 4, diagonal 6,
porteira 11 por tile. A equipe constrói tile a tile (Obras). Porteira na grama ou numa cerca; com a Mão, clique abre e
fecha. A cerca bloqueia ferramentas, obras, ruas e pasto, e ninguém corta o canto de uma diagonal. Os animais só pastam
na área alcançável da porta do abrigo sem cruzar cerca, porteira fechada ou rua; com a porteira fechada atrás deles,
vacas e bois voltam para dentro da cerca e os outros para o abrigo. Save v23. Decidido por mim: a equipe passa por
qualquer porteira (senão ficaria presa fora do pasto), animais voltando para casa também, e a área do pasto começa na
grama logo fora do anel de rua (a porta fica na rua).

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
`threejs-game-ui-designer`, `vitest`, `playwright-cli`.
