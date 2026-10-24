# CutNicePro — Case Study Log (histórico autêntico)

> Registro contínuo e verdadeiro da concepção do produto, para virar case profissional de
> Product Design. **Nada aqui é fictício**: cada entrada distingue pesquisa secundária,
> hipótese, decisão aprovada, avaliação técnica, teste real (nenhum até agora) e resultado
> comprovado (nenhum até agora). Não escrever o "case final" antes dos fatos existirem.

## Contexto do problema

Criador individual (mantenedor) precisa de volume de cortes curtos a partir de conteúdo
longo; processo manual disperso em ferramentas (PRD §1 — hipótese a validar).

## Linha do tempo (entradas em ordem cronológica)

| Data | Tipo | Evento | Evidência |
|---|---|---|---|
| 2026-10-17 | Decisão aprovada | Ambiente de desenvolvimento preparado (skills, MCPs, hooks, harness, protocolo de relatórios) | docs/reports/history/*; SETUP-REPORT |
| 2026-10-17 | Artefato | Exploração visual A/B no FigCraft attached (2 propostas, validadas com inspeção+VISION) | design/; relatório 2226 |
| 2026-10-17 | Avaliação técnica | Auditoria estrutural das propostas (deficiências medidas) + teste de componentização nativa (mestres/instâncias/variantes OK na 0.6.0) | relatório 2330 |
| 2026-10-17 | Decisão aprovada | Identidade oficial (Poppins; preto puro/attractive black/deep aqua/white marble; dark glass 3D restrito) | docs/brand/ |
| 2026-10-17 | Decisão aprovada | Publicação pública do repo + Conventional Commits | GitHub main @ 80f578e |
| 2026-10-17 | Pesquisa secundária | Benchmark OpusClip/CapCut/Descript com fontes datadas | PRD §3 (fontes) |
| 2026-10-17 | Hipótese | Problema, públicos (proto-personas), proposta de valor, escopo MVP/V1 | PRD §1/§2/§6/§7 |
| 2026-10-17 | Artefato | Fundação de produto: PRD, 11 jornadas, 36 BRs + estados, IA, 9 DECisions, backlog (10 épicos/28 US/66 AC), rastreabilidade | docs/product/ |
| 2026-10-17 | Avaliação de consistência | Auditoria de IDs por script: 0 referências quebradas; lacunas declaradas | TRACEABILITY §4 |
| 2026-10-17 | Decisão aprovada (mantenedor) | Modelo comercial: assinatura mensal SEM créditos; IA local ou BYOK; custos externos esclarecidos (DEC-010, BR-037..041) | docs/product/DECISIONS.md |
| 2026-10-17 | Hipótese/decisão | Arquitetura de motor de IA local/BYOK com matriz conceitual por tarefa (DEC-012); reavaliação de DEC-002 por fases sem apagar histórico (DEC-011); fila sequencial MVP como hipótese (DEC-013) | PRD §13; DECISIONS |
| 2026-10-17 | Artefato visual | User Journey Map + Master User Flow + Product Roadmap construídos no FigCraft attached (página `roadmap` do documento do usuário; páginas históricas preservadas) | design/exports/*.png; relatório 02A.1 |
| 2026-10-17 | Avaliação técnica | Script de auditoria versionado (tools/audit) com testes positivo/negativo | TRACEABILITY §4 |

## Hipóteses documentadas (a validar — nenhuma validada)

H1 primeiro projeto sem instruções · H2 compreensão dos modos A/B/C · H3 clareza de
progresso · H4 revisão rápida · H5 controle sobre a IA · H6 exportação sem fricção ·
H7 recuperação/retomada. Proto-personas: 6 (HYPOTHESIS). Detalhe: PRD §2/§12.

## Pesquisa validada

Secundária apenas: benchmark com fontes públicas datadas (PRD §3). **Nenhuma entrevista,
teste de usabilidade, métrica ou resultado real até 2026-10-17.**

## Testes de usabilidade futuros (roteiro pronto)

Criar projeto sem ajuda; importar vídeo; achar "apenas legendar"; identificar corte que
precisa de ajuste; exportar vários; recuperar projeto anterior (PRD §12). Registrar
execuções AQUI com data, participantes reais e achados — nunca fabricar.

## Decisões relevantes e alternativas

DEC-001..DEC-009 (docs/product/DECISIONS.md) com contexto. Alternativas consideradas:
onboarding longo vs. entrada direta (JRN-001 D1); modo A vs. B primeiro (DEC-003);
mídia copiada vs. referenciada (DEC-004); web vs. desktop local (DEC-001).

## Limitações conhecidas

Sem validação com usuários; premissa técnica local-first sem spike de performance;
6 BRs PENDING TECHNICAL VALIDATION; pesos Poppins incompletos no ambiente de design.

## Evolução futura (planejada, não executada)

Fase 02 visual (redesign sob diretrizes) → implementação por incrementos do backlog →
testes de usabilidade → medição dos critérios de sucesso do PRD §11.

## Fase 03 (2026-10-18) — MVP freeze + primeiro incremento funcional M1

**Decisões consolidadas (aprovadas pelo mantenedor):** assinatura mensal sem créditos
(DEC-010) com preço experimental R$ 29,90/mês como HIPÓTESE DE TESTE; D1 resolvida — Home
antes da configuração de IA (config contextual); acesso do beta por convite simples
(DEC-011, forma técnica pendente); offline local permitido tecnicamente (BR-049, política
comercial pendente). Escopo congelado no PRD §7 (MVP v0.1 — SCOPE BASELINE) e marcos
M1..M6 definidos no backlog.

**Escolha técnica (M1):** Vite + React + TypeScript (UI) + Tauri v2/Rust (runtime Windows,
WebView2) — local-first, sem serviços externos. Separação UI ↔ lógica: a persistência vive
exclusivamente em comandos Rust (`list/create/open_project`) sobre JSON local em app-data
com escrita atômica; nenhum dado sai da máquina. Identidade aplicada via tokens da marca
(Poppins, Pure/Attractive Black, Deep Aqua, White Marble).

**M1 entregue e evidenciado:** aplicativo Windows inicializável (exe 3,3 MB + instalador
NSIS); Home com estado vazio (CTA único); criar/listar/abrir projetos; persistência real
comprovada por E2E no app compilado (criar → fechar processo → relançar → projeto
presente) + `projects.json` inspecionado no disco; erros de leitura/gravação tratados
(banner + retry) e testados (arquivo corrompido, nome inválido, id desconhecido).
Evidências: docs/reports/evidence/m1/ (5 screenshots reais + console.log vazio) e relatório
da fase (testes: cargo 7/7, vitest 9/9, tsc, build web, tauri build, E2E desktop EXIT=0).

**Honestidade do case:** interface marcada como protótipo funcional (chips M1/v0.1.0);
funcionalidades futuras exibidas como "em desenvolvimento/planejado" sem fingir
funcionamento; nenhum usuário teste, assinante ou métrica declarado (inexistentes);
validação visual humana do mantenedor pendente (Product Design Gate preservado).


## Apresentação para entrevista — Product Design Case Study v1 (2026-10-21)

Artefato criado por solicitação do mantenedor no FigCraft 0.8.0, via MCP attached: `design/case-study-v1/CutNicePro-Product-Design-Case-Study-v1.figcraft`. São 12 frames 1920×1080, com biblioteca de componentes, variantes, auto layout e tokens vinculados. Estado **IN REVIEW / PENDING HUMAN APPROVAL**. Não altera o produto nem aprova requisitos.

Conteúdo deriva da documentação de produto e marca, capturas reais da Home/editor e exports históricos A/B (REFERENCE). Wireframes de baixa fidelidade são reconstruções retrospectivas explicativas. A timeline Discovery/Define/Ideate/Design/Validate representa o processo, sem alegar duração histórica. Benchmark secundário conferido em fontes oficiais OpusClip, CapCut e Descript em 21/10/2026; fontes e hashes em `design/case-study-v1/sources.json`.

O fechamento distingue testes técnicos históricos da pesquisa com usuários ainda planejada. UPD-020: 24/27 verificações do laboratório de UI aprovadas, com arquivo exportado, aviso da segunda geração e limpeza do lab não concluídos. Nenhum teste de usabilidade, participante, entrevista ou métrica de impacto foi criado ou executado para este case. As afirmações antigas deste log sobre inexistência de testes técnicos descrevem sua época; não representam o motor atual.

PDF de apoio rasterizado e 12 renders no mesmo diretório; texto/diagramas/componentes editáveis ficam no arquivo FigCraft. Sem commits e sem modificação do aplicativo.


## Apresentação v2 para entrevista BTG — 2026-10-21

Plano aprovado pelo mantenedor: 8 frames principais do CutNice Pro + 4 apoios, em documento separado no FigCraft. Artefato: design/case-study-v2/CutNicePro-Product-Design-Case-Study-v2.figcraft. PDF de 12 páginas, roteiro de fala e fontes no mesmo diretório. Estado IN REVIEW / PENDING HUMAN APPROVAL. A v1 com o miniportfólio acrescido pelo mantenedor foi preservada byte a byte.

**Novos relatos recebidos nesta conversa, sem registros brutos anexados:** o autor informou 14 conversas exploratórias com produtores de cortes e 13 pessoas experimentando diretamente o MVP com vídeos de 10 minutos a 3 horas. Informou comparação exploratória de 22 ferramentas (15 pagas, 7 gratuitas), sem protocolo/base que sustente percentuais de precisão ou superioridade. Isso atualiza o contexto do case sem converter retrospectivamente os registros de 17/10 em pesquisa documentada. Nenhuma nova entrevista ou sessão de usabilidade foi conduzida pelo agente nesta tarefa.

As decisões de recência na biblioteca e de reorganização da transcrição foram identificadas pelo próprio autor, sem reteste posterior medido. Biblioteca: antes/depois reconstruído e rotulado como explicativo, sem captura histórica e sem certificação da implementação atual. Transcrição: captura real, busca e seções recolhíveis; não confundir seções extractivas com hooks semânticos concluídos. Omitidos 97%, 55% e preferência 70%/30% por falta de método/registros. Cenário de 4 h e até 100 cortes permanece objetivo de evolução. Compra única e assinatura são propostas relatadas para o case, sem promover alteração das decisões comerciais canônicas.

**Apoio Social Team Kanban / VENDE-C:** interface extraída do miniportfólio fornecido pelo autor. Relato de contas compartilhadas, 2FA e ajustes fora da tarefa, respondidos com acessos corporativos individuais, permissões e comentários. MVP em 2 semanas; adoção concluída em 2 meses. Valores confirmados: R$ 8.000/ano versus R$ 120/mês = R$ 1.440/ano; diferença de R$ 6.560/ano e redução estimada de 82% desses custos recorrentes. Desenvolvimento/manutenção excluídos. R$ 100 em assinatura de IA é desembolso informado em ferramenta, não custo total do trabalho.

A transcrição de dicas de portfólio orientou a edição narrativa, sem substituir o briefing ou virar evidência de pesquisa. Timeline identificada como representação do processo. Capturas, propostas históricas e reconstruções mantêm rótulos distintos. Verificações de artefato e uma rodada delimitada de correção, sem executar testes do aplicativo. Aprovação estética/narrativa permanece com o mantenedor.


## Correção editorial do case v2 — 2026-10-22

O mantenedor rejeitou a linguagem de auditoria nos slides. Revisão aplicada no mesmo FigCraft, com narrativa em primeira pessoa: “Conversei”, “Criei”, “Priorizei”, “Usei” e “Vou medir”. Removidas atribuições como “relatado pelo autor”, notas de ausência de anexos/protocolo e explicações internas sobre o artefato. Dados e limites metodológicos continuam registrados nas fontes, sem criar evidências novas. Planos de medição permanecem no futuro; exemplos de proposta mantêm sua identificação. Arquivo atualizado pelo mantenedor foi carregado antes da edição, preservando seus ajustes e o frame adicional. PDF e roteiro atualizados.


## Case v3 — contexto, decisões e resultado (2026-10-22)

Nova versão autorizada pelo mantenedor, reaproveitando seus ajustes: 16 frames 1920×1080 em nova página “04 · Case v3 · Contexto, decisões e resultado” (id 427) do MESMO arquivo FigCraft v2. Páginas anteriores preservadas integralmente por comparação estrutural. PDF e roteiro em design/case-study-v3/. Sem novo arquivo nativo e sem mudança de produto.

A transcrição de dicas de portfólio foi relida integralmente e aplicada como referência editorial: abertura com o que é o produto, público, problema, solução, papel e estado do MVP; títulos com achado/decisão/resultado; separação de descoberta, roadmap, estratégia e avaliação comercial; user flow com decisão e retorno de ajuste; problema da transcrição antes da solução. Fundos claros/escuros intercalados e exemplos de interface mantidos a partir dos materiais editados pelo mantenedor.

Novos dados fornecidos pelo mantenedor: projeto com cinco semanas; avaliação comercial com 10 usuários, sendo 5 com acesso único e 5 recebendo novas funcionalidades. O segundo grupo trouxe mais sugestões de ajustes, implementações e melhorias; o primeiro enfatizou o que mais gostou. Achado qualitativo, sem inferir preferência 50/50, conversão, pagamento, causalidade ou teste controlado. Os grupos de 14 conversas, 13 experimentações do MVP e 10 da avaliação comercial permanecem distintos; sua sobreposição não foi informada.

Roadmap distribuído conforme prioridade solicitada: Discovery nas semanas 1–2, Define na 3, Ideate na 4, Design/Validate na 5. A distribuição por etapa é uma organização aproximada do foco, não um apontamento diário ou prova de datas exatas. A duração total de cinco semanas é informação do mantenedor.

Fontes, limites e detalhes de autoria ficam em sources.json, fora dos slides. Nenhuma entrevista ou teste de usuário foi executado pelo agente nesta tarefa. 63 critérios de artefato PASS, 0 FAIL finais; aprovação estética/narrativa permanece PENDING HUMAN APPROVAL.


## Case v4 — roteiro final com placeholders (2026-10-22)

Nova página autorizada pelo mantenedor: “05 · Case v4 · Nova narrativa · 12 slides” (id 867), no mesmo design/case-study-v2/CutNicePro-Product-Design-Case-Study-v2.figcraft. Roteiro final de 12 slides fornecido pelo mantenedor, com 10 principais e 2 apoios. As quatro páginas anteriores e seus ajustes permanecem estruturalmente idênticos à fonte carregada. Não foi criado outro arquivo nativo.

Abertura com editor em destaque; preparação manual versus fluxo desejado; benchmark exploratório; estratégia local-first; user flow com ramificação para ajuste; explorações Workspace/Studio; revisão da biblioteca; transcrição; MVP; medição futura; design system e documentação. Textos e diagramas nativos, Poppins, temas Dark/Light e quatro variantes de botão da biblioteca existente. Por instrução expressa, nenhuma captura foi buscada ou incorporada: 12 placeholders editáveis explicam o conteúdo que o mantenedor vai adicionar. Não são evidências de execução.

Não foram reintroduzidos os números de pesquisa, avaliação comercial ou roadmap da V3: a nova seleção segue a última narrativa. Os relatos históricos continuam nos registros anteriores, sem apagamento. Referências exploratórias OpusClip/CapCut/Descript permanecem nas fontes. Não foram executadas entrevistas, testes de usabilidade ou novos testes técnicos do aplicativo.

64 verificações objetivas PASS, 0 FAIL: 12 frames 1920×1080, limites, colisões textuais, z-order, tipografia, componentes, preservação das páginas e PDF de 12 páginas com texto selecionável. PDF renderizado e inspecionado; sem correção adicional necessária. FUNCTIONAL STATUS PASS no escopo de autoria; REGRESSION STATUS NOT TESTED; VISUAL STATUS PENDING HUMAN APPROVAL. Fontes, guia e evidências em design/case-study-v4/.


## Revisão isolada do UI Kit por screenshots — 2026-10-22

- **Escopo:** somente UI Kit (frame 1072, último slide conforme ordem ajustada pelo mantenedor) no mesmo arquivo FigCraft v2 / página 05. Fonte: quatro screenshots fornecidos; código do aplicativo não consultado nem alterado. Os outros 11 slides e 49 objetos preexistentes fora do alvo foram preservados.
- **Entrega:** paleta interpretada dos prints, Poppins Regular/Bold, escala de 4 px, grid real 12×128 px com gutter 16 e margens 104, quatro estilos tipográficos, 23 variáveis próprias. Sete famílias de UI: botões, abas, busca, seletor, switch, slider e presets. 22 componentes principais, cinco conjuntos, 13 variantes e 16 instâncias no slide. Biblioteca de apoio adicionada à página 02 sem modificar seus objetos anteriores.
- **Validação:** 66 critérios PASS, 0 FAIL finais; um gap padrão 10 em dois chips corrigido para 8 na repetição delimitada. Troca de estados, rótulo e ícone verificada nativamente; geometria e z-order sem achados. PDF atualizado com 12 páginas e UI Kit em último; página renderizada e inspecionada. FUNCTIONAL STATUS PASS (artefato); REGRESSION STATUS NOT TESTED; VISUAL STATUS PENDING HUMAN APPROVAL. Evidências em design/case-study-v4/ui-kit/.
- **Continuidade:** sem commit, push, mudança de versão ou aprovação de UI do aplicativo. Próximo passo: revisão estética do mantenedor no FigCraft; estados de hover são variantes de design, não protótipo interativo.
