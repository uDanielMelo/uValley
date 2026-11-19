# Prompt para continuar: etapa 5 (centro comercial)

Cole o bloco abaixo numa sessão nova do Claude Code, na pasta do projeto.

---

Vamos continuar o uValley na **etapa 5: centro comercial (segundo ambiente)**. Leia o contexto, decida o
desenho (tenho dado autonomia: decida o que for de balanceamento e registre em `docs/roadmap.md`) e siga até
o fim validando cada parte.

## Onde estamos

- Leia `CLAUDE.md` (modelo do jogo) e `docs/roadmap.md` (etapas e decisões).
- As etapas 0–4 estão na `main`. Crie `fase-3b-etapa-5` a partir dela.
- Save na versão 12. `npm test` e `npm run build` precisam passar.
- Commit: faça também o push da branch e, ao fim da etapa, o merge (fast-forward) na `main`.

## Escopo (do documento de design)

Troca de cena fazenda ↔ cidade, lojas clicáveis, peso dos itens e capacidade do veículo (upgrade), entregas
pelo carro, contratação na cidade, vendas e pedidos.

## O que já existe

- A picape (`game/visitors.ts`, `scene/Car.tsx`) é só visual: vem pela rodovia nos `CAR.visitHours`, estaciona
  perto da caixa de venda e vai embora.
- Venda direta pela caixa de venda (`InventoryPanel`), loja (`ShopPanel`) com sementes, animais, remédios,
  adubo e lotes, contratação pelo hub da equipe (`WorkersPanel`).
- Armazenamento e estragos (etapa 4) já dão motivo para vender.

## Notas práticas (Windows)

- Testes com `npm test`, nunca `npx vitest`.
- Para editar com Python, grave o script com Write no scratchpad e rode `python arquivo.py < /dev/null`.
  Nunca rode `python -` com `< /dev/null` (o heredoc é ignorado) e nunca deixe um comando lendo da entrada
  padrão.
- Não mate o `npm run dev` do usuário na porta 5173. Use `playwright-cli` para prints (`window.__uvalley` é o
  store, `window.dev` tem as trapaças; `dev.help()` lista).
- Textos da interface em pt-BR, código em inglês.
