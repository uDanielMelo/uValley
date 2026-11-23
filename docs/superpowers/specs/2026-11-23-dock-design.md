# Doca e frete: design

Data: 2026-11-23. Status: **aprovado** pelo usuário ("Plano 9a pode executar"). **9a e 9b implementadas** (branches `fase-4a-etapa-9a` e `fase-4b-etapa-9b`); próximas: 9c–9e, uma sub-etapa por vez. As dúvidas abaixo foram resolvidas com as minhas propostas (ver "Respostas adotadas").

Este documento é a memória do que foi conversado e decidido. Tudo que está em "Decidido pelo usuário" veio da conversa; o que está em "Minhas escolhas" são propostas minhas, provisórias, para o usuário confirmar ou ajustar.

## Intenção e por quê

O jogo quer ser mais realista e menos "infantil" (ver as referências: Farming Simulator, Anno, Transport Fever, RimWorld). Hoje vender é um clique na caixa de venda (instantâneo) ou carregar o veículo à mão no Mercado. O usuário quer que toda saída e entrada de mercadoria passe por uma **doca**, com veículo, frete, equipe trabalhando e prazo. O objetivo declarado é **reduzir o custo da operação com escala**: começar com carro (frete barato, carga pequena) e evoluir para caminhão (carrega mais, frete por unidade menor). A pressão de jogo vem do tempo: a colheita estraga, a equipe pode estar ocupada, o veículo não espera para sempre.

## Decidido pelo usuário

1. **A doca substitui tudo.** A caixa de venda (`shippingBin`) e o carregamento manual do veículo no Mercado saem. O Mercado da cidade fica como vitrine de preços e pedidos.
2. **Estrutura construída com vagas.** Substitui a caixa de venda no pátio. Começa com vaga só para carro; evolui por níveis (mais vagas, depois vaga de caminhão).
3. **Carro que chega sozinho (venda espontânea):** traz uma demanda (item e quantidade). Ao estacionar, o painel mostra o pedido. O jogador confere se consegue cumprir e **cria a atividade** para a equipe levar a carga ao veículo. Espera pouco: se o prazo acaba, vai embora.
4. **Venda por anúncio (aba Vender do painel):** o jogador define produto, preço e quantidade. **Não há resposta imediata.** Ofertas podem aparecer ou não; preço alto reduz ofertas, e como a colheita estraga no estoque, o jogador precisa baixar o preço para vender. Existe também uma lista de **demandas abertas** (os pedidos da cidade) para conferir estoque e enviar.
5. **Aceitou a oferta → chama o frete → a equipe carrega.** (Opção "oferta primeiro, veículo depois".) Prazo (x tempo):
   - Se o prazo acaba com o veículo ainda a caminho, ele volta.
   - Se acaba durante o carregamento, a equipe **descarrega** e o produto **perde valor**.
6. **Compras (tudo que é físico) chegam por frete:** sementes, remédio, adubo, ração e animais. A equipe descarrega. Se todos estiverem ocupados e o prazo acabar, o veículo volta: a mercadoria continua sendo do jogador, mas retida na cidade, e um **novo frete** é cobrado. Pesquisa e decoração continuam instantâneas. A picape tem **frete barato no começo** para não travar a fazenda inicial.
7. **Carregamento como obra (opção A).** Cada viagem é uma entidade salva com estado e `work { done, total }`, como as obras. Nova atividade da equipe (Carga), até 3 trabalhadores posicionados na vaga somando progresso. Sem itens em trânsito carregados por pessoa.
8. **Gado vivo:** estrutura de embarque com **área de contenção** para separar os animais, sempre com ajuda de trabalhadores.

## Minhas escolhas (provisórias, ajustar jogando; números em `src/data/`)

- Prazo na doca: 2 h de jogo para carro espontâneo e para descarga/carga de frete (um só valor em `DOCK`).
- Frete: custo fixo por viagem + valor por kg, por nível de veículo. Picape quase simbólica no início. Frete pago não é devolvido, nem se o prazo estourar.
- Penalidade ao estourar o prazo carregando: ao descarregar, 15% das unidades daquele lote são perdidas (avaria); o restante volta ao estoque.
- Pagamento da venda: no fim da viagem (veículo carregado e saindo), não na aceitação.
- Animal retido na cidade: continua seu, com taxa diária de manutenção e risco de doença se ficar muito tempo.
- Reserva de estoque: só quando a oferta é aceita (o anúncio sozinho não reserva nada).
- Compra de animal checa vaga no abrigo e pasto na hora do pedido e reserva a vaga até a chegada.
- Regra de compra da máquina (provisória, revisar na etapa de economia): cada bem tem preço de referência e demanda diária (determinística por `hash01(dia, bem)` e estação). A cada hora, chance de gerar uma oferta cai conforme `preço / referência` sobe; acima de um teto (ex.: 1,6×) nunca há oferta. A quantidade da oferta cabe na demanda do dia.
- Preço do carro espontâneo (à vista): em torno da referência com variação sorteada; sem frete. A oferta de anúncio paga o preço combinado mais um prêmio de mercado, e cobra frete.

## Metas, não-metas e anti-metas

Metas: venda e compra com trabalho, tempo e custo reais; escala (caminhão) compensando; decisões de preço e de prioridade de equipe; reaproveitar o padrão das obras.

Não-metas agora: economia completa (preço dinâmico profundo, contratos futuros, concorrência), frota própria com motorista, simulação visual de caixas, múltiplas docas.

Anti-metas (seria falha mesmo funcionando): o jogador não poder vender por falta de caixa ou de equipe (frete caro demais no começo); o fluxo exigir cliques demais por viagem; save antigo corromper dinheiro ou estoque.

## Restrições do código atual (achados)

- `src/game/visitors.ts`: o carro é **derivado do relógio e nunca salvo**. Na doca ele vira estado salvo (nova entidade de viagem); a cena passa a desenhar a partir dela. A rota (BFS pelas estradas, curvas em arco) é reaproveitada, com a vaga como destino em vez da frente da caixa de venda (`parkingGoal`).
- `src/game/market.ts`: `loadCargo`, `unloadCargo`, `deliverCargo`, `PICKUP_DELAY` e `GameState.cargo` saem. `ORDERS`/`refreshOrders`, `basePrice`, pesos (`CROP_WEIGHT`, `PRODUCT_WEIGHT`) e `VEHICLES` ficam.
- `src/data/structures.ts` (`shippingBin`, `START_STRUCTURES` em 33,57), `scene/models/ShippingBin.tsx`, `StructureCard.tsx` e `HoverInfo.tsx` tratam a caixa de venda e precisam trocar para a doca. Casa e caixa de venda não têm `cost` (não são construíveis nem demolíveis): a doca inicial segue assim; níveis são reformas (`work.kind = 'upgrade'`).
- Armazenamento é derivado (sem local): a carga sai do `inventory` direto, sem rota de estoque até a vaga.
- A doca precisa de anel de rua e acesso à estrada (`needsRoadAccess`): sem estrada, sem vaga funcionando.
- Save atual é 16 (`OLDEST_LOADABLE_VERSION` 16). Mudar o formato exige `SAVE_VERSION` 17 e migração: `shippingBin` → `dock`, `cargo` devolvido ao `inventory`, `vehicleLevel` mantido.
- Convenções: lógica pura em `src/game`, balanceamento só em `src/data`, textos em pt-BR, `ActionResult` com códigos de erro em `ERROR_MESSAGES`, testes Vitest, sem `any`.

## Abordagens consideradas

1. **Carregamento como obra (escolhida).** Viagem salva com `work {done,total}`; nova atividade `haul` (Carga); até 3 posições na vaga. Padrão de `construction.ts`; determinístico; sobrevive à noite.
2. Carregamento por unidade (descartada): cada lote vira tarefa com o trabalhador andando com item em trânsito. Mais visual, muito mais estado e interrupção de tarefa.
3. Fluxo todo derivado do relógio, sem estado novo (descartada): não comporta prazo, equipe ocupada, mercadoria retida e valor perdido.

## Modelo de dados proposto

```ts
type ShipmentKind = 'walkin' | 'sale' | 'purchase' | 'redelivery';
type ShipmentPhase = 'enroute' | 'waiting' | 'working' | 'leaving' | 'done';

interface Shipment {
  id: number;
  kind: ShipmentKind;
  vehicle: VehicleLevel;
  bay: number | null;            // vaga ocupada, null enquanto a caminho
  phase: ShipmentPhase;
  arrivesAt: number;             // minutos de jogo
  deadline: number;              // fim da espera na doca
  goods: ShipmentGood[];         // bens por quantidade, ou animais por id
  money: number;                 // recebimento (venda) ou valor da compra
  freight: number;
  work: { done: number; total: number };
  direction: 'out' | 'in';
}
interface Listing { id: number; good: Good; price: number; quantity: number; postedAt: number }
interface Offer { id: number; listingId: number; quantity: number; price: number; expiresAt: number }
interface HeldPurchase { id: number; goods: ShipmentGood[]; since: number }   // retido na cidade
```

`GameState` ganha `shipments`, `listings`, `offers` e `held`; perde `cargo`. `Tile`/estruturas ganham o tipo `dock` com `level` e vagas derivadas de `DOCK_LEVELS`.

## Fluxos

- **Visita espontânea:** em horários sorteados (`hash01`), cria `Shipment kind 'walkin'`, `phase 'enroute'`. Ao chegar, ocupa vaga livre; se não houver, espera na estrada e some no prazo. O painel abre com o pedido. O jogador cria a atividade Carga (verifica estoque; reserva). Equipe soma `work`; concluído: paga e o carro sai. Prazo estourado: sem carga, sai sem pagar; se já carregando, desfaz com a avaria.
- **Anúncio:** `Listing` fica aberto. Cada hora de jogo `generateOffers` pode gerar `Offer` com validade. Aceitar: reserva estoque, cria `Shipment kind 'sale'` com frete e `arrivesAt` (viagem). Carregar, sair, pagar no fim.
- **Demanda da cidade (pedido):** igual ao anúncio, mas a oferta já existe (o pedido), com prêmio e prazo próprio.
- **Compra:** carrinho na loja vira pedido de frete (escolha de veículo conforme peso); paga no pedido; veículo chega, equipe descarrega; sucesso: itens entram no inventário; prazo estourado: vira `HeldPurchase`, e "pedir novo frete" cria `redelivery`.
- **Equipe:** `build`-like. Nova atividade `haul` (tecla a definir) com `job: { type: 'shipment', shipmentId }`, até 3 trabalhadores por vaga em posições fixas junto à vaga; progresso na viagem, não no trabalhador.

## Sub-etapas (cada uma com branch, `npm run build`, `npm test`, save versionado)

**9a. Doca, vaga de carro e visita espontânea**
- Dados: `DOCK` e `DOCK_LEVELS` em `src/data/docks.ts`; estrutura `dock` em `data/structures.ts` (substitui `shippingBin` no pátio); modelo `scene/models/Dock.tsx`.
- Lógica: `game/dock.ts` (vagas, ocupação), `game/shipments.ts` (criar, avançar fases, prazo), integração em `simulation.advanceGame`.
- Tarefas: atividade `haul` em `workers.ts` e `data/workers.ts`; posições na vaga; progresso.
- Visitors: `visitors.ts` passa a seguir a viagem salva (rota para a vaga).
- UI: `DockPanel` (aba Chegou agora), `StructureCard`/`HoverInfo`, Dock (atalho).
- Save 17 e migração (`shippingBin` → `dock`, `cargo` → inventário). Testes: fases, prazo, estoque insuficiente, migração.

**9b. Anúncios, ofertas e frete de venda**
- `game/listings.ts` (`generateOffers`, aceitar), aba Vender e Demandas abertas no `DockPanel`, frete (`FREIGHT` em `data/docks.ts`), avaria no estouro de prazo, pagamento no fim.
- Remover `loadCargo`, `deliverCargo`, `cargo`, `PICKUP_DELAY` e o carregamento manual do `MarketPanel`; Mercado vira vitrine de preços e pedidos. Testes: curva de oferta por preço, determinismo, reserva de estoque.

**9c. Compras por frete**
- Carrinho/pedido no `ShopPanel` (sementes, remédio, adubo, ração, animais); `purchase`/`redelivery`/`HeldPurchase`; descarga pela equipe; taxa diária do animal retido. Vagas de abrigo reservadas no pedido.

**9d. Caminhão e níveis da doca**
- `DOCK_LEVELS`: mais vagas e vaga de caminhão (área maior, estrada); veículos de frete por peso (`VEHICLES`); frete por kg menor no caminhão; `GaragePanel` vira escolha do veículo padrão de frete.

**9e. Embarque de gado**
- Estrutura `loadingPen` (curral de embarque) com área de contenção; o animal marcado para venda vira tarefa `tend`/`haul` de conduzir ao brete; separação; carga em caminhão boiadeiro; peso por animal; estresse e perda se ficar tempo demais retido.

## Dúvidas que dependem do usuário

1. Que habilidade a atividade `haul` usa? Minha proposta: criar o tipo de tarefa `haul` e usar **Construção** por enquanto (sem habilidade nova), ajustando depois; a alternativa é uma habilidade "Logística".
2. Quanto de avaria (15%) e prazo (2 h) parecem certos?
3. Venda de gado vivo exige caminhão (não picape)? Minha proposta: sim, a partir do nível 2 da doca.
4. O carro espontâneo pode pedir coisas que a fazenda ainda não produz? Minha proposta: não, só o que a fazenda conhece (como os pedidos).
5. A doca no pátio inicial fica no mesmo lugar da caixa de venda (33, 57) com a mesma frente para a rua?

## Respostas adotadas (9a)

1. Carga usa a habilidade Construção (tipo de tarefa `haul`, sem habilidade nova).
2. Avaria de 15% (pelo menos 1 unidade, só se a carga já tinha começado) e prazo de 2 h (`DOCK` em `src/data/docks.ts`).
3. Gado vivo exige caminhão (a partir do nível 2 da doca): fica para a 9e.
4. O cliente avulso só pede o que a fazenda conhece; em 70% das vezes, algo que ela tem em estoque.
5. A doca fica no lugar da caixa de venda (33, 57), de frente para a rua; a vaga é o tile de estrada à frente.

Diferenças da 9a para o modelo proposto: `Shipment` tem `setOffAt` (para desenhar o carro na ida), `leftAt`/`goneAt` e `outcome` em vez da fase `done`; a viagem só tem o tipo `walkin` e não tem `vehicle`, `freight` nem `direction` (entram na 9b/9c). O cliente que não encontra vaga livre não vem. A venda instantânea do inventário foi removida já na 9a; a carga manual do Mercado fica até a 9b.

## Como ficou a 9b

- `Listing { id, good, price, quantity, postedAt, offered: { day, units } }` e `Offer { id, listingId, quantity, price, expiresAt }` como no modelo; `HeldPurchase` fica para a 9c.
- `Shipment.kind` é `walkin` ou `sale` (oferta ou pedido; o pedido vai em `order` para voltar à lista se a venda cair). Fase nova `scheduled` (frete contratado esperando o horário e a vaga). `staged` marca o lote fora do inventário; `freight` e `vehicle` ficam na viagem.
- Referência dos anúncios: o preço da cidade (`marketPrice` = base × `MARKET_BONUS`), que é o "prêmio de mercado"; a oferta paga o preço do anúncio. Chance por hora: `OFFERS.hourlyChance × min(maxBoost, ((teto − razão)/(teto − 1))²)`, zero a partir de 1,6×.
- Demanda diária por `hash01(dia, bem)`, escalada pelo preço do bem como os pedidos; a estação ainda não entra.
- O frete é pago ao fechar e roda das 6h às 19h; prazo de 5 h a partir do primeiro horário possível. Ele só sai com a vaga livre e 40 min de folga para carregar; senão a venda cai (a mercadoria volta, o frete não). Ao estacionar, a carga começa sozinha.
- O cliente avulso não vem enquanto há frete esperando vaga (o frete tem prioridade).

## Como retomar numa nova sessão

1. Ler este documento e `docs/roadmap.md` (seção "Etapa 9").
2. Implementar a próxima sub-etapa (9c: compras por frete) quando o usuário pedir.
3. Cada sub-etapa termina atualizando `CLAUDE.md` e `docs/roadmap.md`, com testes e `npm run build`.
