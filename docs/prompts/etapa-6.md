# Prompt para continuar: etapa 6 (construção em planta baixa)

Cole o bloco abaixo numa sessão nova do Claude Code, na pasta do projeto.

---

Vamos continuar o uValley na **etapa 6: hub de construção em planta baixa**. Leia o contexto, decida o
desenho (tenho dado autonomia: decida o que for de balanceamento e registre em `docs/roadmap.md`) e siga até
o fim validando cada parte.

## Onde estamos

- Leia `CLAUDE.md` (modelo do jogo) e `docs/roadmap.md` (etapas e decisões).
- As etapas 0–5 estão na `main`. Crie `fase-3c-etapa-6` a partir dela.
- Save na versão 13. `npm test` e `npm run build` precisam passar.
- Commit: faça também o push da branch e, ao fim da etapa, o merge (fast-forward) na `main`.

## Escopo (do documento de design)

Visual azulado de projeto ao construir estradas e prédios, compra de decoração e iluminação.

## O que já existe

- Modo de construção (`buildMode` no store, `BuildPanel`, `BuildGhost`, tecla B, R gira, Esc sai), estradas
  por clique e arraste, demolir. Obras são feitas pela equipe (`game/construction.ts`).
- Postes de luz só existem na cidade (`scene/city/CityScene.tsx`); janelas e lampião emissivos à noite
  (`scene/materials.ts`).

## Notas práticas (Windows)

- Testes com `npm test`, nunca `npx vitest`.
- Para editar com Python, grave o script com Write no scratchpad e rode `python arquivo.py < /dev/null`.
  Nunca rode `python -` com `< /dev/null` (o heredoc é ignorado) e nunca deixe um comando lendo da entrada
  padrão.
- Não mate o `npm run dev` do usuário na porta 5173. Use `playwright-cli` para prints (`window.__uvalley` é o
  store, `window.dev` tem as trapaças; `dev.help()` lista).
- Textos da interface em pt-BR, código em inglês.
