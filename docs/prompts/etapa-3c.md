# Prompt para continuar: etapa 3c (raças, estrelas e ciclo de vida)

Cole o bloco abaixo numa sessão nova do Claude Code, na pasta do projeto.

---

Vamos continuar o uValley na **etapa 3c: raças, estrelas e ciclo de vida dos animais**. Antes de
escrever código, leia o contexto, faça uma análise curta com o desenho proposto e as dúvidas, e
pergunte o que for decisão minha. Depois disso, siga até o fim validando cada parte.

## Onde estamos

- Leia primeiro `CLAUDE.md` (regras e modelo do jogo, atualizado) e `docs/roadmap.md` (plano,
  sub-etapas 3a–3e e decisões já tomadas).
- A 3b foi feita na branch `fase-2f-etapa-3b` (saiu de `main`, que tem tudo até a 3a). Se ela já foi
  mesclada, crie `fase-2g-etapa-3c` a partir da `main`; senão, a partir da `fase-2f-etapa-3b`.
- Save na versão 9. `npm test` (126 testes) e `npm run build` precisam passar.
- Quando eu pedir commit, faça também o push da branch (`git push -u origin <branch>`).

## Decisões já tomadas que valem para a 3c

- **Não há abate.** O animal **morre de velhice** no fim do ciclo.
- **Não há reprodução por enquanto.** Filhote só existe se for comprado.
- Pata fica no galinheiro com as galinhas. Boi é espécie de tração própria, no curral.
- O nível 4 (automatizado) dos abrigos ficou para depois.

## Escopo da 3c (do documento de design)

- **Raças por espécie**, com efeito no produto principal: leite, ovos, lã, trufa ou tração (boi e
  cavalo).
- **Estrelas de 1 a 3** por animal.
- **Ciclo de vida:** filhote, jovem, adulto e idoso, com uma curva de produção por fase. A fase é
  **derivada** da idade e do relógio e nunca é salva, como o estágio das plantas. No fim do ciclo, o
  animal morre (aviso ao jogador).

## O que já existe e a 3c usa

- `src/data/animals.ts`: `ANIMALS` (custo, ração, produto, `productionHours`, `labor`,
  `pastureUnits`).
- `src/game/animals.ts`: compra (`addAnimal`/`buyAnimal`), passeio e volta ao abrigo (`stepAnimals`),
  produção para o estoque do abrigo, `laborMultipliers` (boi e cavalo).
- `src/game/shelters.ts`: abrigo, vagas, nível (`productionMultiplier`), `crowdingFactor`.
- `Animal` em `src/game/types.ts` tem `id, kind, shelterId, x, y, path, waitMinutes, productMinutes,
  fed`. Faltam raça, estrelas e nascimento.
- Na cena, `src/scene/Animals.tsx` e `src/scene/models/animalModels.ts`: um modelo por espécie com
  vertex colors, escala em `ANIMAL_SIZES` (`data/scale.ts`). Filhote pode ser escala menor, e a raça
  pode ser cor por instância, sem geometria nova.
- A loja (`src/ui/ShopPanel.tsx`) compra por espécie, e o card do animal fica no hover
  (`AnimalInfo` em `src/ui/HoverInfo.tsx`).

## Desenho que proponho (confirme ou ajuste comigo antes)

1. **Dados:** `BREEDS` por espécie em `src/data/animals.ts` (nome pt-BR, cor, modificador de
   produção ou de tração, preço), níveis de estrela (produção e preço), fases do ciclo (idade em dias
   de jogo onde cada fase começa, produção por fase, expectativa de vida).
2. **`Animal` ganha `breed`, `stars` e `bornAt`** (minuto de jogo). A fase e a produção são
   derivadas. Na compra, escolhe-se a raça e a idade (filhote ou adulto, com preços diferentes).
3. **Morte por velhice:** checada à meia-noite (determinística, `hash01`), com aviso no toast. O
   animal sai do abrigo e libera a vaga.
4. **Tração:** `laborMultipliers` passa a considerar raça, estrelas e fase.
5. **UI:** loja com escolha de raça e idade; card do animal com raça, estrelas, idade e fase; talvez
   clicar no animal com a Mão selecione e abra um card, como já acontece com as estruturas.
6. **Visual:** filhote menor, cor por raça, idoso talvez mais lento.
7. **Save v10** com migração (animais existentes = raça comum, 2 estrelas, adultos) e testes Vitest.

## Dúvidas para me fazer antes de codar

- Quantas raças por espécie (2 ou 3?), e se a raça muda só a quantidade ou também o preço do produto.
- Quanto dura a vida de cada espécie em dias de jogo (1 dia = 25 min reais): ciclo curto (algumas
  semanas reais) ou longo.
- Se idoso ainda produz pouco ou nada, e se dá para vender um idoso.

## Notas práticas deste ambiente (Windows)

- Testes com `npm test`, nunca `npx vitest` direto (problema da letra do drive).
- Heredoc no Bash com crases ou `${...}` quebra o shell. Para scripts Python de edição, grave o
  script com Write no scratchpad e rode `python arquivo.py`, ou use Edit.
- O repositório normaliza para LF (`eol=lf`).
- Para ver o jogo, o usuário costuma deixar `npm run dev` rodando na porta 5173. **Não mate esse
  processo**: use o servidor que já está lá. `window.__uvalley` é o store e `window.dev` tem as
  trapaças (`dev.spawn('cow', 2)` cria abrigo de graça, `dev.products()`, `dev.build()`,
  `dev.skip(h)`; `dev.time(h)` pula o relógio sem simular). Use a skill `playwright-cli` para prints.
- Textos da interface em pt-BR, código em inglês.
