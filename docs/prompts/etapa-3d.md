# Prompt para continuar: etapa 3d (saúde e predadores)

Cole o bloco abaixo numa sessão nova do Claude Code, na pasta do projeto.

---

Vamos continuar o uValley na **etapa 3d: saúde dos animais e predadores**. Antes de escrever código,
leia o contexto, faça uma análise curta com o desenho proposto e as dúvidas, e pergunte o que for
decisão minha. Depois disso, siga até o fim validando cada parte.

## Onde estamos

- Leia primeiro `CLAUDE.md` (regras e modelo do jogo, atualizado) e `docs/roadmap.md` (sub-etapas
  3a–3e e decisões tomadas).
- A 3c foi feita na branch `fase-2g-etapa-3c`, que saiu da `fase-2f-etapa-3b`. Crie
  `fase-2h-etapa-3d` a partir da branch mais recente que já tiver a 3c.
- Save na versão 10. `npm test` (138 testes) e `npm run build` precisam passar.
- Quando eu pedir commit, faça também o push da branch (`git push -u origin <branch>`).

## Decisões já tomadas

- Não há abate. O animal morre de velhice aos 96 h reais (filhote 12 h, jovem 12 h, adulto 48 h,
  idoso 24 h, em 1×). Não há reprodução.
- Abrigos vão até o nível 3 por enquanto (o automatizado ficou para depois). Cada nível já tem
  **conforto** e **segurança** (0–1) em `SHELTER_LEVELS`, e o galinheiro ganha `safetyBonus` (tela)
  a partir do nível 2. A segurança ainda não tem efeito: a 3d é quem dá sentido a ela.

## Escopo da 3d (do documento de design)

- **Saúde:** doenças, visual diferente no animal doente, aviso (mais cedo se houver um trabalhador
  com a habilidade "Tratar animais") e remédio comprado.
- **Predadores:** o que dá valor à segurança do galinheiro e do aprisco.

## O que já existe e a 3d usa

- `src/game/shelters.ts`: `shelterComfort`, `shelterSafety`, `crowdingFactor` (lotação do pasto),
  `levelDef`.
- `src/game/animals.ts`: `lifeStage` (idoso adoece mais?), `fed` (fome), `productionRate`,
  `removeDeadAnimals` (morte por velhice, com evento `animalsDied` no `advanceGame`).
- Tarefas da equipe: `tend` (coleta no abrigo, `job: { type: 'shelter' }`, criada sozinha por
  `queueShelterChores`). Medicar pode ser outra tarefa `tend` com um novo `job` (ex.:
  `{ type: 'medicate', animalId }`), e a equipe anda até o animal ou o abrigo.
- Habilidade e especialidade de animal já existem (`TASK_SKILL.tend = 'animals'`, `specialtyMatches`).
- UI: `AnimalCard` (card do animal selecionado com a Mão), `HoverInfo`, `StructureCard` (mostra
  conforto e segurança do abrigo), loja (`ShopPanel`), toasts no store (`advance`).
- Sorteios devem ser determinísticos (`hash01` de `src/game/random.ts`), nunca `Math.random`.

## Desenho que proponho (confirme ou ajuste comigo antes)

1. **Saúde no `Animal`:** `health: { disease, since, detected }` ou ausente quando saudável. A
   chance de adoecer por hora depende de conforto, lotação, fome e idade. Há uma incubação escondida;
   quem tem a habilidade detecta antes. O doente produz pouco ou nada e pode morrer se não for
   tratado em X horas.
2. **Remédio:** item comprado na loja (`inventory.medicine` ou parecido) e tarefa de medicar
   (atividade 🪣 Tratar animais). Remédio usado cura.
3. **Predadores:** sorteio à noite por abrigo, com chance × (1 − segurança); os animais fora do abrigo
   (se algum ficar) correm mais risco. Perda de um animal com aviso no toast. Talvez um visual simples
   (raposa saindo do mapa).
4. **Visual:** animal doente com tom esverdeado ou ícone, e talvez andando mais devagar.
5. **UI:** aviso no toast, contador de doentes no card do abrigo e no do animal, botão "Medicar"
   (enfileira a tarefa).
6. **Save v11** com migração (todos saudáveis) e testes Vitest.

## Dúvidas para me fazer antes de codar

- Quantas doenças (uma genérica por espécie ou duas ou três com efeitos diferentes)?
- O doente sem tratamento morre, ou só para de produzir até sarar sozinho?
- O predador leva só aves e ovelhas e cabras (galinheiro e aprisco) ou qualquer espécie?
- Quão frequentes devem ser doença e predador, para não frustrar o jogador?

## Notas práticas deste ambiente (Windows)

- Testes com `npm test`, nunca `npx vitest` direto (problema da letra do drive).
- Heredoc no Bash com crases ou `${...}` quebra o shell. Para scripts Python de edição, grave o
  script com Write no scratchpad e rode `python arquivo.py`, ou use Edit.
- O repositório normaliza para LF (`eol=lf`).
- O usuário costuma deixar `npm run dev` rodando na porta 5173. **Não mate esse processo**: use o
  servidor que já está lá. `window.__uvalley` é o store e `window.dev` tem as trapaças
  (`dev.spawn('cow', 2)` cria abrigo de graça, `dev.products()`, `dev.build()`, `dev.skip(h)`,
  `dev.age(h)`; `dev.time(h)` pula o relógio sem simular). Use a skill `playwright-cli` para prints; o
  navegador dela tem armazenamento próprio, então `newGame()` ali não apaga o save do usuário.
- Textos da interface em pt-BR, código em inglês.
