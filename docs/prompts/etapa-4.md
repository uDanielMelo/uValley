# Prompt para continuar: etapa 4 (armazenamento e clima)

Cole o bloco abaixo numa sessão nova do Claude Code, na pasta do projeto.

---

Vamos continuar o uValley na **etapa 4: armazenamento e clima**. Leia o contexto, decida o desenho (tenho
dado autonomia: decida o que for de balanceamento e registre em `docs/roadmap.md`) e siga até o fim
validando cada parte.

## Onde estamos

- Leia `CLAUDE.md` (modelo do jogo) e `docs/roadmap.md` (etapas e decisões).
- A etapa 3 inteira (3a–3e) está na `main`. Crie `fase-3a-etapa-4` a partir dela.
- Save na versão 12. `npm test` e `npm run build` precisam passar.
- Commit: faça também o push da branch e, ao fim da etapa, o merge (fast-forward) na `main`.

## Escopo (do documento de design)

- O celeiro guarda produtos agrícolas e animais. Capacidade por construção (silo, armazém, celeiro).
- Intempéries e estações.
- Perda e conservação por nível, refrigeração.

## O que já existe

- `inventory.produce` (colheitas) e `inventory.products` (produtos animais) não têm limite.
- Construções silo, armazém e celeiro existem (`data/structures.ts`) mas só decoram.
- O dia tem 1440 min de jogo; `game/time.ts` tem as funções de dia e hora.
- Sorteios determinísticos com `hash01` (`game/random.ts`).

## Notas práticas (Windows)

- Testes com `npm test`, nunca `npx vitest`.
- Para editar com Python, grave o script com Write no scratchpad e rode `python arquivo.py < /dev/null`.
  Nunca deixe um comando lendo da entrada padrão.
- Não mate o `npm run dev` do usuário na porta 5173. Use `playwright-cli` para prints (`window.__uvalley`
  é o store, `window.dev` tem as trapaças; `dev.help()` lista).
- Textos da interface em pt-BR, código em inglês.
