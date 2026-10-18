# M1DR — Auditoria de Design (pós-HOLD)

> Fase: M1 Design Recovery — INTERROMPIDA/HOLD. Este documento é a revisão
> obrigatória pós-checkpoint: classifica o que já existe em REUTILIZAR /
> REFINAR / DESCARTAR DO DESIGN FUTURO. Nada aqui altera o FigCraft, o React
> ou o Rust. Base: inspeção estrutural das camadas (registro de criação +
> get_node), 2 análises VISION (evidências em docs/reports/evidence/
> m1dr-hold/ e m1dr-audit/) e o DNA das 5 referências do mantenedor.

## Método e fontes

- Estrutura real das camadas (fills, hierarquia, auto layout) — inspeção MCP.
- Crítica visual renderizada — VISION sobre m1-telas-estado-na-interrupcao.png
  e m1-componentes-estado-na-interrupcao.png.
- Critérios de alinhamento — DNA extraído das 5 referências (ref-01..05.png
  em docs/reports/evidence/m1dr-audit/): "preto profundo + grotesca leve +
  UM acento por tela + display vs micro-caps + bento arredondado respirado;
> profundidade por material, não por sombra; microtexto curto e declarativo".
- Fato estrutural confirmado: frames criados sem fill explícito renderizam
  BRANCO padrão (lição Fase 01). Afeta: rótulo da área (945), logo do TopBar
  (1008), spacer full-width do TopBar (1012 — a "linha clara atravessando a
  barra"), frames externos dos TextInput (958/959), spacers do StatusFeedback
  (992/993). É bug de execução, não decisão de design.

## A. REUTILIZAR (consistente com a direção oficial)

| Item | Por quê |
|---|---|
| Mecânica de componentes FigCraft | Mestres + instâncias + variantes reais (sets 957/970/981/994) com overrides funcionando — infraestrutura correta, alinhada à regra anti-"centenas de elementos soltos" |
| Tokens oficiais onde aplicados | #000000 canvas, #231F20 superfície, #02C2BE acento, #E6E7E8 texto, #B9BBBD apoio, Poppins — presentes na maior parte |
| Auto layout + paddings consistentes | Cards 20px, botões 20px laterais, gap 12 — disciplina de espaçamento mantida |
| Cobertura de estados (telas A–E) | O conjunto A/B/C/D/E espelha exatamente os estados do app real (vazio, lista, criar, abrir, auxiliares) — a matriz está certa |
| Estrutura do ProjectCard | nome + 2 metas + ação única — esqueleto correto (a execução é que refina) |
| Estrutura do TextInput | label / field / helper / erro — esqueleto correto |
| StatusFeedback com ação de retry | Erro + causa + "Tentar novamente" — padrão correto |
| LoadingState skeleton | Abordagem de esqueleto (não spinner) — adequada |
| Escala de raio 8/12/16 e grid 3-col | Consistente com bento arredondado das referências |
| AppShell como padrão TopBar+conteúdo | Composição por instância funcionou; formalizar como mestre é refinamento |

## B. REFINAR (aproveitável com melhorias)

| Item | Problema (evidência) | Direção da correção |
|---|---|---|
| Cor do texto de apoio | #6F7276 ≈3,4:1 sobre #231F20 / 4,3:1 sobre #000 — abaixo de AA para 11–12px; cor fora dos tokens | Promover tom de apoio a TOKEN oficial com contraste verificado (≥4,5:1) — decisão do mantenedor; candidato: clarear para ~#8B8E93 ou usar #B9BBBD |
| Aqua em excesso | ~12 pontos de acento (5 pills "Abrir", CTA, botão, chips, ícones) vs referências: UM acento por tela | Ghost como botão padrão; Primary/aqua reservado ao CTA principal; card inteiro clicável em vez de pill repetida |
| Hierarquia do card | pill "Abrir" vence o título; metas idênticas entre si | Título 15 Bold como elemento dominante; distinguir criação vs último acesso (peso/cor); ação discreta |
| UX Writing da ação de criar | 4 rótulos ("Novo projeto"/"Criar projeto"/"Criar primeiro projeto"/"Criar novo projeto") | UM rótulo oficial (proposta: "Novo projeto" no botão; título do dialog "Novo projeto") — ver skill cutnicepro-ux-writing |
| Local-first duplicado no dialog C | subtítulo + helper dizem o mesmo | Manter UMA menção (helper do campo) |
| Empty state | painel pequeno flutuando acima do centro ótico; copy promete features inexistentes | Centrar no centro ótico do conteúdo; copy honesta do estado atual (criar projeto) com visão marcada; âncora visual maior |
| Dialog C | posicionado acima do centro; overlay escurece a TopBar sem padrão definido | Centrar no conteúdo; definir regra do overlay (TopBar dim ou não) e documentar |
| Grid B | metade inferior vazia; AddNew misturado como última célula; contador "6" vs 5 projetos reais | Ritmo vertical (máx. linhas visíveis + paginação futura); AddNew como ação separada do grid (ou primeira célula); contador = projetos reais |
| Tela D | dropzone gigante sem rótulo/ícone internos | Conteúdo interno: ícone linha + "Importar mídia" + nota "M2" honesta |
| Ícones | glifos tipográficos (⋯ ! i +) | Iconografia de linha fina monocromática (refs: line icons outline) |
| Datas | "Criado 18 out 2026" (formato curto não-pt-BR completo); leitura de mistura absoluto/relativo | Regra única: relativo curto ("há 2 h", "ontem") + absoluto completo no hover/tooltip; ver skill |
| Mestres com nomes técnicos | m-button-primary etc. | Renomear semanticamente (Button, TextInput...) na retomada |
| Placeholder itálico | itálico reduz legibilidade | Placeholder regular, tom de apoio |
| AppShell/Modal formais | compostos por padrão | Decidir componentização (slot ou mestre dedicado) na retomada |

## C. DESCARTAR DO DESIGN FUTURO (preservar registro histórico)

| Item | Motivo | Registro histórico |
|---|---|---|
| Metas "· N cortes" nos cards | dado fictício de feature inexistente (M4) renderizado como real — viola honestidade do protótipo | Telas B atuais (frame 1018) permanecem no doc como estão até limpeza autorizada |
| Copy do empty state ("Importe um vídeo, gere legendas...") | promete funcionalidades do M2–M4 no estado M1 | Frame 1017 preservado |
| Rótulos múltiplos de criação (3 variantes excedentes) | fragmentação de vocabulário | Sobrescrever nas cópias futuras; originais preservados |
| Subtítulo local-first duplicado | redundância | — |
| Formato de data "N out 2026" | não-pt-BR completo; fora da regra a definir | — |
| Contador "6 projetos" com 5 cards reais | incoerência de dado | — |
| Fill branco default em frames sem fill | bug de execução (não decisão); "blocos brancos crus" apontados | Corrigir apenas em novas cópias; NÃO tocar no documento em HOLD |
| Pills "Abrir" aqua 5× | padrão de acento excessivo | — |
| Glifos tipográficos como ícones (⋯ ! i +) | abaixo do padrão de iconografia das refs | — |
| "Revisar" como ação de reconexão | verbo vago | — |
| Placa branca do logotipo no TopBar | lê como logo provisório (efeito do bug de fill + composição) | Logotipo definitivo é decisão de marca pendente |

> Nenhuma exclusão foi executada. Os itens C permanecem no documento
> FigCraft (salvo + backup cutnicepro-hold-m1dr-0404) como registro
> histórico até autorização explícita de limpeza.

## Falha do Harness (documentada, NÃO alterada nesta tarefa)

`baseline_checks.check_app_tests` procura apenas `package.json` NA RAIZ do
repo; o aplicativo vive em `app/` (com `npm test` = vitest 9/9 e cargo test
7/7 válidos). Resultado: baseline reporta `SKIP — "sem package.json (app nao
implementada)"`, mensagem FALSA para o estado atual. Correção proposta
(quando autorizada, fora de tarefa de UX): estender o harness para procurar
`package.json` também em `app/` e executar os testes lá. Nada foi alterado
no harness nesta tarefa.

## Skill instalada

`.zcode/skills/cutnicepro-ux-writing/` — diretrizes de redação de interface
pt-BR do CutNicePro (vocabulário único, datas, empty states, erros com
causa+ação). **ATENÇÃO: skill nova exige REINICIAR o ZCode antes de ser
carregada/invocada.**
