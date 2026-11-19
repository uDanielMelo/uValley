# Prompt para continuar: etapa 7 (plantações 2.0)

Cole o bloco abaixo numa sessão nova do Claude Code, na pasta do projeto.

---

Vamos continuar o uValley na **etapa 7: plantações 2.0**. Leia o contexto, decida o desenho (tenho dado
autonomia: decida o que for de balanceamento e registre em `docs/roadmap.md`) e siga até o fim validando
cada parte.

## Onde estamos

- Leia `CLAUDE.md` (modelo do jogo) e `docs/roadmap.md` (etapas e decisões).
- As etapas 0–6 estão na `main`. Crie `fase-3d-etapa-7` a partir dela.
- Save na versão 13. `npm test` e `npm run build` precisam passar.
- Commit: faça também o push da branch e, ao fim da etapa, o merge (fast-forward) na `main`.

## Escopo (do documento de design)

Pesquisa de culturas, culturas de campo e de estrutura (estufa, pomar), adubo, habilidade por cultura.

## O que já existe

- Três culturas (`data/crops.ts`: trigo, milho, tomate), crescimento só regado (`game/growth.ts`), estações
  (`game/climate.ts`), adubo (`data/fertilizer.ts`, atividade Adubar), especialidade de cultura nos
  trabalhadores (`Specialty`), armazenamento e estragos por item (`data/storage.ts`), peso por item e
  pedidos da cidade (`data/market.ts`).

## Notas práticas (Windows)

- Testes com `npm test`, nunca `npx vitest`.
- Para editar com Python, grave o script com Write no scratchpad e rode `python arquivo.py < /dev/null`.
  Nunca rode `python -` com `< /dev/null` (o heredoc é ignorado) e nunca deixe um comando lendo da entrada
  padrão.
- Não mate o `npm run dev` do usuário na porta 5173. Use `playwright-cli` para prints (`window.__uvalley` é o
  store, `window.dev` tem as trapaças; `dev.help()` lista).
- Textos da interface em pt-BR, código em inglês.
