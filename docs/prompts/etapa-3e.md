# Prompt para continuar: etapa 3e (esterco e adubo)

Cole o bloco abaixo numa sessão nova do Claude Code, na pasta do projeto.

---

Vamos continuar o uValley na **etapa 3e: esterco e adubo**, a última sub-etapa da etapa 3. Antes de
escrever código, leia o contexto, faça uma análise curta com o desenho proposto e as dúvidas, e pergunte
o que for decisão minha. Depois disso, siga até o fim validando cada parte.

## Onde estamos

- Leia primeiro `CLAUDE.md` (regras e modelo do jogo, atualizado) e `docs/roadmap.md` (sub-etapas
  3a–3e e decisões tomadas).
- A 3d foi feita na branch `fase-2h-etapa-3d`, que saiu da `main` (que já tem a 3c). Crie
  `fase-2i-etapa-3e` a partir da branch mais recente que já tiver a 3d.
- Save na versão 11. `npm test` (156 testes) e `npm run build` precisam passar.
- Quando eu pedir commit, faça também o push da branch (`git push -u origin <branch>`).

## Decisões já tomadas

- Não há abate nem reprodução. O animal morre de velhice aos 96 h reais (em 1×).
- Abrigos vão até o nível 3 por enquanto (o automatizado ficou para depois). O chiqueiro nível 3 já
  promete no card "Esterqueira: esterco melhor para adubo" (só texto): a 3e é quem dá efeito a isso.
- Saúde (3d): verminose, gripe, infecção e ferimento; vermífugo e antibiótico; medicar e recolher carcaça
  são tarefas automáticas de 🪣 Tratar animais. Predadores atacam à noite.

## Escopo da 3e (do documento de design)

- **Esterco**: se acumula no abrigo e é coletado pela equipe.
- **Adubo**: adubar a terra acelera ou melhora a planta (versão simples; a etapa 7, plantações 2.0,
  amplia).

## O que já existe e a 3e usa

- `src/game/shelters.ts`: `stock` do abrigo, `addStock`, `stockCap`, `collectShelter`,
  `queueShelterChores` (tarefa `tend` com `job: { type: 'shelter' }`). O esterco pode ir para o mesmo
  estoque ou para um contador próprio no abrigo.
- `src/game/animals.ts`: `stepAnimals` (produção por animal; o esterco pode seguir o mesmo ritmo,
  com `healthFactor` de `game/disease.ts`).
- `src/game/growth.ts` e `src/game/crops.ts`: crescimento por `growthMinutes`, só enquanto regada. O
  adubo pode multiplicar o crescimento ou dar colheita extra (`HARVEST_BONUS` já existe para a
  efetividade do trabalhador).
- Ordens por área (`applyArea`, `toggleTask`, `projectTasks`) e o hub de atividades (`Dock`, teclas 1–4):
  adubar pode ser uma quinta atividade ou parte do plantio.
- UI: `StructureCard` (abrigo), `HoverInfo` (tile), `InventoryPanel`, `ShopPanel` (o adubo também pode
  ser comprado?), toasts no store.
- Sorteios determinísticos (`hash01` de `src/game/random.ts`), nunca `Math.random`.

## Desenho que proponho (confirme ou ajuste comigo antes)

1. **Esterco**: cada animal gera esterco num ritmo próprio (vaca e porco mais, galinha menos) e ele vai
   para o abrigo; a coleta `tend` já existente passa a levar também o esterco para o inventário
   (`inventory.manure` ou parecido). O chiqueiro nível 3 dá esterco melhor (mais unidades ou adubo
   mais forte).
2. **Adubo**: item de inventário (o esterco curtido) usado numa ordem nova "Adubar" sobre tile arado ou
   plantado. O tile ganha `fertilized` até a colheita: a planta cresce mais rápido (ex.: +30%) ou dá
   colheita extra.
3. **Visual**: terra adubada mais escura, monte de esterco no abrigo quando acumula.
4. **UI**: ferramenta Adubar no hub, contador de adubo no inventário, esterco no card do abrigo.
5. **Save v12** com migração e testes Vitest.

## Dúvidas para me fazer antes de codar

- Adubar é uma atividade nova (tecla 5) ou acontece junto com o plantio quando há adubo?
- O adubo acelera o crescimento, aumenta a colheita ou os dois?
- O esterco pode ser vendido ou só usado na fazenda? Dá para comprar adubo na loja?
- Esterco acumulado demais no abrigo deve aumentar a chance de doença (liga com a 3d)?

## Notas práticas deste ambiente (Windows)

- Testes com `npm test`, nunca `npx vitest` direto (problema da letra do drive).
- Heredoc no Bash com crases ou `${...}` quebra o shell. Para scripts Python de edição, grave o
  script com Write no scratchpad e rode `python arquivo.py < /dev/null`, ou use Edit. Nunca deixe um
  comando lendo da entrada padrão (ex.: `cat` sem arquivo): ele trava até o tempo limite.
- O repositório normaliza para LF (`eol=lf`).
- O usuário costuma deixar `npm run dev` rodando na porta 5173. **Não mate esse processo**: use o
  servidor que já está lá. `window.__uvalley` é o store e `window.dev` tem as trapaças
  (`dev.spawn('cow', 2)` cria abrigo de graça, `dev.products()`, `dev.build()`, `dev.skip(h)`,
  `dev.age(h)`, `dev.sick('flu')`, `dev.attack()`, `dev.preview()`, `dev.medicine(n)`; `dev.time(h)` pula o relógio sem
  simular). Use a skill `playwright-cli` para prints; o navegador dela tem armazenamento próprio, então
  `newGame()` ali não apaga o save do usuário. Os arquivos que ela cria em `.playwright-cli/` não vão
  para o commit.
- Textos da interface em pt-BR, código em inglês.
