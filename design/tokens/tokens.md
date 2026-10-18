# CutNicePro — Guia de Aplicação dos Tokens

Complementa `docs/brand/BRAND-FOUNDATION.md` (valores e racional) e
`design/tokens/tokens.json` (fonte de máquina). Aplicar na próxima revisão visual.

## Cores — onde cada token vive

| Superfície/elemento | Token |
|---|---|
| Fundo do app, área de vídeo | `color/pure-black` |
| Painéis (topbar, sidebars, timeline, inspetor, statusbar) | `color/attractive-black` |
| Cards e superfícies elevadas sobre painéis | `color/surface-raised` |
| Botão primário (fundo) / texto do botão primário | `color/deep-aqua` / preto |
| Seleção, foco, progresso, playhead, estado ativo | `color/deep-aqua` |
| Hover de ação | `color/aqua-hover` |
| Título, texto principal | `color/white-marble` |
| Metadados, texto secundário | `color/marble-70` |
| Bordas, separadores, trilhas inativas | `color/border` / `color/track` |

Regra: Deep Aqua é **escasso** — só ações principais, seleção/ativo e progresso. Se tudo
é aqua, nada é.

## Tipografia

- Família única: Poppins. Pesos por função (ver BRAND-FOUNDATION §2).
- Timecodes/métricas: números tabulares.
- Mínimo prático 11 px; 10 px só em badges/chips curtos e uppercase com tracking.

## Espaçamento e ritmo

- Múltiplos de 4: 4/8/12/16/24/32. Nada "quebrado" (sem 7, 13, 18).
- Padding interno de painéis: 16; gap entre cards: 12; gap entre grupos: 24.
- Raios: 4 micro / 6 controles / 8 painéis e cards / 12 modais.

## Mapeamento para variáveis do FigCraft

Na próxima revisão, criar coleção de variáveis (comando verificado na 0.6.0:
`variable.bind`, editor de variáveis do app) com os mesmos nomes:

```
color/pure-black      #000000
color/attractive-black #231F20
color/deep-aqua       #02C2BE
color/white-marble    #E6E7E8
color/marble-70       #B9BBBD
color/aqua-hover      #5AD7D4
color/surface-raised  #2B2728
color/border          #3A3A3C
space/4..32, radius/4-6-8-12
```

Ligar fills/strokes/cornerRadius/gap/padding às variáveis — nunca hex solto. O teste de
componentização de 2026-10-17 (docs/reports/history/) valida a infraestrutura
necessária (componentes, instâncias, variantes, overrides).

## Mapeamento para frontend futuro

Mesmos nomes como CSS custom properties (`--color-deep-aqua`, `--space-16`,
`--radius-control`, `--font-weights-*`), gerados a partir do `tokens.json`. O
`inspect.componentCode` do FigCraft já emite CSS com os valores — os tokens garantem que
esses valores venham de uma fonte única.
