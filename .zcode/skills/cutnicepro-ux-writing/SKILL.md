---
name: cutnicepro-ux-writing
description: Diretrizes de redação de interface (UX Writing) em pt-BR para o CutNicePro. Usar ao escrever ou revisar qualquer texto de UI do produto (botões, empty states, erros, metadados, diálogos, toasts) em design FigCraft ou implementação React. Consolidada na Fase M1DR e revisada no gate de conteúdo M1 (2026-10-18).
---

# CutNicePro — UX Writing (pt-BR)

## Princípios

1. **Consistência terminológica com adaptação de contexto.** O vocabulário
   é ÚNICO por conceito (glossário abaixo) para que o usuário aprenda uma
   palavra só — mas o MESMO conceito pode flexionar o enunciado conforme o
   contexto sem virar outro conceito: "Novo projeto" é o rótulo fixo da
   ação (botões, menu); em um empty state pode guiar com uma frase
   ("Crie seu primeiro projeto" como TÍTULO editorial é aceitável) desde
   que o BOTÃO continue "Novo projeto". O que não pode é chamar a ação
   por nomes diferentes nos CONTROLES (caso real: 4 rótulos de botão na
   M1DR). Regra prática: controles seguem o glossário à risca; textos
   editoriais (títulos de empty state) podem parafrasear o conceito.
2. **Curto e declarativo.** Frases completas quando explicam; palavras
   soltas quando rotulam. Sem pontos de exclamação. Sem adjetivos de
   marketing ("incrível", "poderoso"). Tom: técnico-humano, seco, confiante
   (alinhado às referências da marca).
3. **Honestidade de estado.** O texto descreve o que o produto FAZ hoje.
   Funcionalidade futura só aparece marcada como visão/roadmap (ex.:
   "M2 — em desenvolvimento"), nunca prometida como atual. Dados fictícios
   em mockups devem ser evidentes (ou ausentes).
4. **Erro = causa + ação.** Toda mensagem de erro diz o que falhou E o que
   o usuário pode fazer ("Não foi possível carregar os projetos. / Tentar
   novamente").
5. **Sentence case** para títulos, botões e labels (só a primeira letra
   maiúscula). ALL CAPS reservado a micro-rótulos de sistema/eyebrow com
   letter-spacing (padrão das referências).
6. **Zero ruído interno na interface do cliente.** Rótulos de fase
   ("M1"), "protótipo funcional/visual", marcos ("M2 — em
   desenvolvimento"), números de versão destacados ("v0.1.0") e qualquer
   jargão de processo SÓ em ambientes internos de desenvolvimento — nunca
   na interface que o usuário final vê. Se um recurso ainda não existe,
   simplesmente não aparece (não fica "planejado" na tela comercial); a
   exceção honesta é um único texto de onboarding explicando o estado
   inicial do beta, redigido para o usuário, sem siglas internas.

## Vocabulário oficial (glossário)

| Conceito | Rótulo oficial | Não usar |
|---|---|---|
| Ação de criar projeto (controles) | **Novo projeto** | "Criar projeto", "Criar novo projeto", "+ Criar projeto" em botões |
| Confirmar criação (botão do dialog) | **Criar** | "Salvar", "OK", "Adicionar" |
| Cancelar | **Cancelar** | "Descartar", "Voltar" (em dialog) |
| Abrir projeto | **Abrir** | "Abrir projeto" (redundante no contexto do card) |
| Biblioteca | **Projetos** | "Meus projetos", "Biblioteca", "Workspace" |
| Local-first (1ª menção por tela) | **salvo neste computador** | "local-first" (jargão), repetir a menção |
| Retomar navegação | **← Projetos** | "Voltar para projetos" |
| Tentar de novo | **Tentar novamente** | "Revisar", "Recarregar" |
| Estado sem projetos (título editorial) | **Nenhum projeto ainda** | "Comece seu primeiro projeto" como título de CONTROLE; como título editorial do empty state é aceitável |

(Manter glossário sincronizado com o Product Brain ao criar novos conceitos.)

## Padrões

### Datas e tempos
- Relativo curto até 7 dias: **há 5 min · há 2 h · ontem · há 3 dias**.
- Absoluto completo a partir disso: **18 de out de 2026** (never "18 out
  2026"). Hora quando relevante: **às 14:32**.
- Card de projeto: **Criado {absoluto}** e **Aberto {relativo}** — a
  REGRA é: cada linha usa o formato mais ÚTIL para aquela informação
  (criação = absoluta, acesso = relativa); o que é proibido é o MESMO
  dado oscilar de formato entre cards, ou duas informações distintas
  disputarem formato na mesma linha.
- Metadados que ainda não existem no produto (cortes, durações) NÃO aparecem.

### Contadores
- Sempre conferir contra o conteúdo real: **{n} {projeto|projetos}**;
  card de ação "Novo projeto" não entra na contagem.

### Empty states
- Estrutura: título curto (o que fazer ou o estado) + 1 frase de contexto
  no PRESENTE, sobre o que o produto já faz + 1 CTA do glossário.
- Exemplo M1: "Nenhum projeto ainda / Organize seus vídeos em projetos —
  tudo fica salvo neste computador. / [Novo projeto]".
- Funcionalidades futuras (importar, legendas, cortes) NÃO entram no
  empty state comercial; se o mantenedor quiser antecipar a visão, em
  material de apresentação usar marcação explícita de roadmap — nunca na
  interface como se existisse.

### Diálogos
- Título = ação (igual ao botão que o abriu). 1 linha de contexto no máx.
- Helper do campo explica consequência ("O projeto fica salvo neste
  computador.") — não repetir o subtítulo do dialog.

### Erros e feedback
- Formato: **{O que falhou}. {Ação}** — "Não foi possível salvar o projeto.
  Tentar novamente". Sem culpa ao usuário ("você errou"), sem código/stack.

### Validação de formulário
- Dizer o esperado: "Informe um nome para o projeto." / "Nome muito longo
  (máx. 80 caracteres)." — já corretas; manter.

### Placeholders
- Regular (não itálico), exemplo real: "Ex.: Podcast — Ep. 12". Placeholder
  NÃO duplica o label.

## Anti-padrões (verificar em review)

- [ ] Mesma ação com rótulos diferentes em CONTROLES de telas diferentes
- [ ] Informação duplicada na mesma tela (subtítulo + helper)
- [ ] Dados/metas de features não implementadas sem marcação
- [ ] Contador incoerente com itens listados
- [ ] Mesmo dado com formatos diferentes entre cards (ou formatos
      trocados: relativo p/ criação, absoluto p/ acesso)
- [ ] "!", jargão interno ("BYOK" sem expandir, "local-first"), tom de anúncio
- [ ] Botões com substantivo vago ("Revisar", "Gerenciar") onde cabe verbo+objeto
- [ ] Rótulos internos de desenvolvimento na interface do cliente
      (fases "M1/M2", "protótipo", "v0.x" destacado, "PENDING")
