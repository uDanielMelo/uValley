# Prompt para continuar: etapa 8 (GitHub e social)

Cole o bloco abaixo numa sessão nova do Claude Code, na pasta do projeto.

---

Vamos continuar o uValley na **etapa 8: GitHub e social**. Leia o contexto e o que já foi feito da etapa 8
em `docs/roadmap.md`, decida o desenho do que falta e siga até o fim validando cada parte.

## Onde estamos

- Leia `CLAUDE.md` (modelo do jogo) e `docs/roadmap.md` (etapas e decisões).
- As etapas 0–7 estão na `main`. `npm test` e `npm run build` precisam passar.
- Commit: faça também o push da branch e, ao fim, o merge (fast-forward) na `main`.

## Escopo (do documento de design)

Backend (ex.: Supabase com login GitHub), save na nuvem, perfis e amigos, impacto de contribuições na fazenda
com teto (para não premiar commits vazios).

## O que depende de mim

- Criar o projeto no Supabase (URL e chave anônima) e o app OAuth do GitHub. Sem isso, o login e o save na
  nuvem não podem ser testados de verdade. Peça as variáveis (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
  ou deixe o cliente pronto atrás de uma verificação de configuração.

## Notas práticas (Windows)

- Testes com `npm test`, nunca `npx vitest`.
- Para editar com Python, grave o script com Write no scratchpad e rode `python arquivo.py < /dev/null`.
- Não mate o `npm run dev` do usuário na porta 5173. Use `playwright-cli` para prints.
- Textos da interface em pt-BR, código em inglês.
