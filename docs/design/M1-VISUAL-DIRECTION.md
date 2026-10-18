# M1 — Direção Visual Recomendada: "Studio Console"

> UMA direção, proposta para aprovação do mantenedor. Nada disto foi
> aplicado ao FigCraft ou ao código. Fundamenta-se em: Brand Foundation,
> tokens oficiais, as 5 referências do mantenedor (DNA extraído na
> M1DR-AUDIT), a auditoria REUTILIZAR/REFINAR/DESCARTAR e as skills
> consultadas (cutnicepro-ux-writing, design-taste-frontend,
> web-design-guidelines, minimalist-ui).

## O conceito em uma frase

> No CutNicePro, **a mesa de edição do usuário** (o lugar onde vídeos
> viram cortes) se torna **um console de estúdio escuro**: uma superfície
> de trabalho preta, respirada, com UM foco luminoso por tela e dados
> técnicos tratados com carinho tipográfico — não um painel administrativo.

"Studio Console" responde ao posicionamento (ferramenta profissional de
edição, local-first) e ao DNA comum das referências (preto profundo +
grotesca + acento único + contraste extremo de escala + profundidade por
material). O concorrente genérico ("dashboard de SaaS com cards iguais")
não consegue preencher essa frase — é exatamente o que foi reprovado.

## 1. Composição (Home 1440×900)

- **TopBar de 64px** — estrutura mínima e estável: wordmark à esquerda
  (Poppins Bold 18, "Cut" e "Pro" em White Marble, "Nice" em Deep Aqua —
  único aqua da barra); à direita, NADA na versão comercial M1 (conta só
  existe no M6; remover chips "M1/protótipo/v0.1.0" — regra 6 da skill).
  Borda inferior por degrau de tom (#000 → #0A0A0A no início do conteúdo),
  não por linha 1px.
- **Região de conteúdo com margens generosas**: 64px laterais (ref-01 usa
  gutters pretos largos), 48px acima do título. O conteúdo começa com o
  TÍTULO DE PÁGINA, não com filtros nem tabs (não há nada para filtrar
  no M1).
- **Eixo tipográfico dominante**: "Projetos" em display (Poppins SemiBold
  ~28–32px, tracking -0.01em) + contador discreto na linha de base. Este é
  o elemento "display vs micro" pedido pelas referências — na Home vazia,
  o título cresce ainda mais (~40px) e assume o papel de herói.
- **Ação única no canto direito da cabeça**: botão "Novo projeto" (única
  área aqua grande da tela). Ghost buttons em todos os outros lugares.
- **Modal**: overlay escurece o CONTEÚDO, mantém a TopBar ativa (padrão
  de app com barra de janela própria); diálogo centrado no centro ÓTICO
  da área de conteúdo (≈64px abaixo do centro geométrico).

## 2. Hierarquia

1. Título "Projetos" (display) → 2. Nome do projeto no card (15–16px
   SemiBold) → 3. Metas (12–13px, tom de apoio) → 4. Ação "Abrir" (ghost
   discreto ou card inteiro clicável com hover — a pill aqua repetida 5×
   é DESCARTADA: competia com o título).
- Cada card: 1 elemento dominante (nome), 2 linhas de meta DISTINTAS
  entre si (criação em tom de apoio; acesso levemente mais claro —
  o "último aberto" importa mais na retomada).
- Micro-rótulos (ex.: futuro "3 cortes") só em ALL CAPS 11px + tracking
  quando a feature existir — por ora, ausentes.

## 3. Tipografia (Poppins, família única)

| Papel | Peso/tamanho | Observações |
|---|---|---|
| Display (título da Home vazia) | SemiBold 40/1.1, tracking -0.02em | O "momento display" das refs |
| Título de página (Home cheia) | SemiBold 30/1.15 | |
| Nome de projeto (card) | SemiBold 16/1.3 | dominante do card |
| Corpo/contexto | Regular 14/1.5 | máx. ~70 caracteres/linha |
| Metas e apoio | Regular 12.5/1.4 | tom de apoio (ver §10) |
| Micro-rótulo técnico (futuro) | Medium 11, caps, tracking 0.08em | padrão refs |
| Botões | SemiBold 13.5 | sentence case |

- Pesos: Regular/Medium/SemiBold + Bold só no wordmark. (Instalar
  Medium/SemiBold no ambiente de design — pendência conhecida; no app
  já embarcados via @fontsource.)
- Números de data/hora em feature-setting tabular quando lado a lado.

## 4. Grid e organização dos projetos

- Grade **bento de 3 colunas** (cards 368–380px de largura com gutters de
  24px) — ritmo das refs; **máximo 2 linhas visíveis** no M1 (6 projetos),
  sem rolagem infinita simulada.
- Card: preenchimento #231F20 SEM borda 1px (separação por degrau de tom
  sobre o #000 — regra das refs e do taste: "surfaces are separated by a
  small step in tone, never by a line"); raio 12; padding 24; altura
  ~168px; **hover**: elevação por tom (#2B2728) + nome ganha aqua NOS
  30% centrais? Não — hover muda o tom do card e o cursor; aqua fica
  apenas no foco de teclado (anel de acessibilidade).
- Ação "Novo projeto" NÃO ocupa célula do grid (AddNew card descartado da
  posição final): a ação primária vive no cabeçalho da seção; quando a
  grade não estiver cheia, a última célula simplesmente não existe
  (grid honesto). Alternativa aceitável (a decidir na retomada): célula
  fantasma tracejada APENAS quando 0<projetos<limite de linha — marcada
  como refinamento, não padrão.

## 5. Estado vazio (Home sem projetos)

- Composição central-hORIZONTAL, mas com peso visual real: título display
  40px + uma **âncora gráfica** à escolha do mantenedor:
  (a) glifo de play em contorno aqua fino 1.5px sobre quadrado r12 #231F20
  (discreto, atual), ou (b) pequeno render 3D de vidro/preto do wordmark
  (pontual, coerente com refs 02–04) — recomendado (b) só se houver
  asset; sem asset, (a).
- Texto CM-001..003 da Content Matrix; CTA "Novo projeto" primário.
- O painel do empty state NÃO é uma caixa tracejada flutuante (descartado:
  "retângulo vazio" foi sinal de protótipo) — é composição tipográfica
  direta sobre o preto, ancorada no eixo do título.

## 6. Navegação

- M1: TopBar única + breadcrumb "← Projetos" no workspace. Nenhum menu
  lateral (não há segunda seção). Quando M2+ criar seções (Importar/
  Processar), avaliar sidebar minimalista — decisão futura, não agora.
- Foco visível em todos os controles (anel aqua 2px, offset 2) — regra
  de acessibilidade.

## 7. Componentes (estratégia)

| Componente | Estratégia |
|---|---|
| TopBar | REFINAR (estrutura ok; remover chips internos; degrau de tom) |
| Button Primary/Ghost | REFINAR (Ghost = default; Primary só no CTA "Novo projeto"/"Criar"; raio 8; altura 40) |
| IconButton | REUTILIZAR com ícone de linha fina (trocar glifo "⋯") |
| TextInput Default/Error | REFINAR (corrigir fill branco dos mestres; placeholder regular; label "Nome") |
| ProjectCard Default | REFINAR (sem borda, degrau de tom, hover, metas distintas, sem pill) |
| ProjectCard AddNew | DESCARTAR DO DESIGN FUTURO (ação no cabeçalho; célula fantasma = opcional) |
| EmptyState | REFINAR (composição tipográfica; remover caixa tracejada) |
| StatusFeedback | REUTILIZAR estrutura; REFINAR cor do ícone Info (aqua, não azul) e verbo |
| LoadingState | REUTILIZAR (skeleton por degrau de tom) |
| AppShell/Modal | FORMALIZAR como mestres na retomada |

## 8. Densidade visual

- Respirada: poucos elementos, cada um grande o suficiente (refs: "nada
  encaixotado"); a Home cheia M1 tem 1 título + 1 contador + 1 CTA + ≤6
  cards. Espaço negativo é intencional — mas SEM a metade inferior vazia
  da versão reprovada: o grid preenche a área útil e o rodapé respira
  96px (não "vazio", "fim de composição").

## 9. Uso controlado de Deep Aqua (#02C2BE)

Não "exatamente 1 por tela" (regra arbitrária) — **orçamento de acento**:
- **Obrigatório**: 1 ação primária por tela (botão Primário) + wordmark
  "Nice" + anel de foco (estado, não decoração).
- **Permitido com parcimônia**: ícone de play do empty state; ícone Info;
  valor ativo de toggle futuro.
- **Proibido**: pills repetidas por card, chips decorativos, ícones em
  massa, aqua em texto corrido. Resultado alvo: o olho encontra o aqua
  em <1s e sabe o que é acionável — como nas refs (1 acento guia, nunca
  mancha).

## 10. Contraste e acessibilidade (WCAG AA)

- Texto principal: #E6E7E8 sobre #000/#231F20 → ~15:1/12,9:1 ✓.
- **Tom de apoio NOVO a promover a token** (substitui #6F7276 ≈3,4:1):
  proposto **#9BA0A4** (≈6,9:1 sobre #231F20; ≈7,6:1 sobre #000) — cumpre
  AA para 12,5px e mantém a sutileza; registrar como
  `marble50/support` no tokens.json na retomada (decisão do mantenedor).
- Aqua #02C2BE sobre #000 ≈ 10,9:1 ✓ (texto/bordas); texto PRETO sobre
  botão aqua ≈ 10,9:1 ✓.
- Focus visible, alvos ≥44px, navegação por teclado (Tab order: wordmark →
  CTA → cards), aria-labels do CM-018/040.
- Placeholder em tom de apoio (não itálico, não mais claro que metas).

## 11. 3D pontual (quando fizer sentido)

- Referências 02–04 são RENDERS de marca (esfera líquida, seda negra,
  cromo) — o DNA "profundidade por material" nelas é imagem de marca,
  não componente de UI. Tradução honesta para o produto M1: **um único
  momento 3D** — o glifo/wordmark do empty state (b) — com material de
  vidro escuro e reflexo aqua discreto, produzido como asset estático.
  Nada de glassmorphism em painéis/botões (banned pela marca e pelo
  taste). Se não houver asset, (a) vetorial — e 3D fica para onboarding
  futuro.

## Diferenças em relação ao design reprovado (síntese)

| Antes (reprovado) | Direção proposta |
|---|---|
| Título pequeno + pills aqua 5× + chips "M1/v0.1.0" | Display tipográfico dominante; aqua orçado em ação+wordmark+foco |
| Cards com borda 1px e pill "Abrir" | Cards por degrau de tom, card clicável, ação discreta |
| Empty state em caixa tracejada pequena | Composição tipográfica central com âncora gráfica |
| Metas iguais + "· N cortes" fictício | Metas distintas (criação/aberto), zero dados futuros |
| #6F7276 ilegível | Token de apoio #9BA0A4 (AA) |
| Fill branco em mestres (bug) | Correção obrigatória nas novas cópias (REFINAR TextInput/TopBar) |
| Grid com AddNew no fim + metade vazia | Grid honesto ≤6, ação no cabeçalho, rodapé respirado |
| "protótipo funcional M1" na tela | Zero ruído interno na interface comercial |

## O que esta direção NÃO decide (pendências do mantenedor)

1. TopBar direita na versão comercial (CM-005) — recomendação: vazia.
2. Wordmark textual vs. logo definitivo (decisão de marca).
3. Asset 3D do empty state (produzir ou usar glifo vetorial).
4. Célula fantasma "Novo projeto" quando grid parcialmente cheio.
5. Promoção de #9BA0A4 (e dos degraus #0A0A0A/#2B2728-hover) a tokens.
