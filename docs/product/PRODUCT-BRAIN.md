# CutNicePro — Product Brain (índice permanente)

Continuação vigente2026-10-27: Complemento31 corrige divergência entre legendas da prévia/exportação e riscos do fechamento. Cues/destaquesTS/ASS coincidem nos4855frames da montagem real; fonte vertical corrigida64em vez de113,78. Export integral de161,833s medido em131,58s, contra173,08s no reteste humano anterior; NVENC confirmado, imagem/áudio na cauda e4855frames preservados. Continua acima dos30s relatados no CapCut; filtrosCPU permanecem gargalo, sem alegar benchmark equivalente. CUDA isolado rejeitado por tempo/pixels; mudanças adotadas preservaram os600frames comparados.77TS/80Rust distintos no escopo, build padrão atualizada; mantenedor está exportando para reteste. Sem novos testes pesados ou edições de código durante esse teste. BR/AC-EDITOR-10..12/M3/M5; meta integralACTIVE/PARTIAL e aprovação humana pendente. EstudoREA/exportCapCut tem fatia estática documentada, sem prova deGPUativa ou integração automática.

Atualização vigente2026-10-27 — entrada direta no Editor e correções da fila implementadas, em teste humano. Ícone Editor abre montagem vazia identificável em Meus projetos; ASR é explícito por mídia, sem iniciar na importação. EOF→imagem/áudio, escala800%/campos, zoom/pan/minimapa somente de visualização e rodapé de mídia corrigidos. Contratos BR/AC-EDITOR-10/11, JRN-009; evidências e limites no ENGINE-HANDOFF Complemento24. Suítes1267TS/374Rust passaram,33opt-in ignorados; build normal recompilada, sem commit/push. Aceite WebView/ASR real/visual e797MB pendentes. Pesquisa ampla anterior continua adiada; esta entrega não encerra o editor integral. Refinamento adicional da mesma fatia: snap visual/magnético de centros e bordas ao arrastar, com Alt para ajuste livre, e clique no vazio limpando a seleção real sem mover cursor ou gravar. Ver BR/AC-EDITOR-11 e Complemento24.

Direção vigente de 2026-10-27: meta do editor retomada, ACTIVE/PARTIAL. Após publicação do checkpoint `b709235` e confirmação do Graphify remoto, marcadores M/segundo M/duplo clique, metadados nome/cor de faixa e organização da timeline foram implementados/testados, em revisão humana. Contrato BR-EDITOR-09, aceites AC-EDITOR-09, JRN-009/EPIC-008; detalhe no BUSINESS-RULES/TRACEABILITY/BACKLOG e em `docs/engineering/EDITOR-BASIC-IMPLEMENTATION-PLAN.md`. Anotações absolutas/pós-fim não alteram duração/render; extrair filtra/rebasa; nomes têm limite de 120 caracteres Unicode, contador/clamp na UI e validação TypeScript/Rust, sempre como texto JSX literal. Principal centralizada com poucas faixas e acessível na base, sem hit-test através dela. Checkpoint: suíte integral 1.160 TS, 359 Rust aprovados/33 opt-in ignorados e build/lint aprovados. Perda de foco após duplo clique → Excluir foi reproduzida/corrigida, com 34/34 testes afetados e um caso novo: 1.161 únicos cobertos ao combinar evidências, sem nova suíte integral. Terra realizou três passagens sobre fixtures e não encontrou colisões no escopo final; estética e uso normal continuam humanos. Jornada normal, vídeo de 797MB, recursos/desempenho e gates M0/M5/M6/M7 permanecem abertos; a pausa abaixo é histórica. Continuidade efetiva permanece no ENGINE-HANDOFF.

Pedido de encerramento da rodada2026-10-26: concluir a fila de imagens/trechos curtos, lixeira7dias, importação/arraste e tempo/Novo após edição; publicar commits e pausar a meta. Retomada preserva as lacunas M0/M5/M6/M7 do plano e exige novo comando do mantenedor. Filtros atuais: Ativos, Todos e Lixeira; regras antigas de aprovação não escondem conteúdo. Detalhes e estado efetivo no Complemento19 do ENGINE-HANDOFF, sem inferir aceite visual.

Direção aprovada em 2026-10-26: editor básico completo e jornada de projetos, com salvamento explícito, montagem independente da fonte, múltiplas mídias/faixas, legendas preservadas e exportação da revisão salva. Especificação vinculante: `docs/engineering/EDITOR-BASIC-IMPLEMENTATION-PLAN.md`. Execução IN PROGRESS, M0–M5 e M6 de estudo comparativo profundo do editor CapCut acrescentado expressamente pelo mantenedor; nenhuma aprovação visual ou conclusão do editor inferida de testes do domínio. M6 cobre mapa de funções, caminhos de importação/timeline/prévia/camadas e comparação por marcos equivalentes, sem autorizar recursos extras automaticamente. BR-EDITOR-01..06 e AC-EDITOR-01..06 nos documentos canônicos abaixo; continuidade no ENGINE-HANDOFF. A melhoria editorial do modelo continua fora desta meta.

Direção adicional M7A implementada em revisão: novas mídias por referência com SHA integral verdadeiro, preservando projetos/cópias gerenciadas existentes. Ownership e recuperação de vínculos explícitos, resolvedor comum e proteção contra exclusão/sobrescrita de originais.334 Rust/743 TS e builds passaram; FFmpeg real em fixture própria, sem inferência ASR ou jornada normal completa nesta fatia. Contratos e critérios no mesmo plano; teste manual e medição de latência permanecem pendentes. Não promete importação instantânea.

Refinamento expresso do mantenedor no M6: prioridade é o usuário corrigir/fechar cortes da IA com um editor fluido e confiável, não transformar o CutNicePro em clone do CapCut. Timeline, gestos e controles de faixa claros complementam a investigação de player/seek/cache/frame apresentado. O mantenedor confirmou os testes de ocultar/mute/salvar/reabrir, abertura e depois cursor/Espaço; isso não aprova esteticamente o editor inteiro nem prova a causa original do reload. Retorno seguinte encontrou perda de camadas ao aparar com ímã: trim foi separado da remoção global de intervalo, preservando grupos independentes. Integração atual922/922 TS, lint e build sem avisos; no reteste, o mantenedor confirmou a preservação das camadas.339 Rust anteriores permanecem válidos no escopo nativo inalterado. Limites e continuidade no ENGINE-HANDOFF Complemento16; meta integral e estudo M6 ainda ativos.

Refinamento seguinte no Complemento17: biblioteca com ações por ícone/tooltip próprio, tag Editado na altura da nota e títulos de até duas linhas; criar recorte oferece Ir para clipes, preservando o rascunho e a decisão de saída. Novo contrato nativo rejeita criação sem vídeo/imagem antes de alterar vínculos; roundtrip/export combinado nativo validado em fixture própria. Otimização medida do SplitPreview remove reinícios redundantes, sem ganho geral deFPS demonstrado. No Complemento18, os botões+ da principal passaram a inserir no início/fim com intenção por operação e sem seek, preservando a adição no cursor. Jornada normal, vídeo797MB, transporte de imagens grandes e lacunas M6 seguem abertos; sessão de pesquisa está encerrada nesta rodada. Os testes não substituem aceite humano.

Decisão de geração em 2026-10-25: mantenedor autorizou versões sobrepostas/contidas e teto de 16 por execução, com qualidade própria de cada versão e preservação dos cortes anteriores. Revogada a seleção obrigatoriamente disjunta; segmentos internos do EditPlan v1 não mudam. Regra em BUSINESS-RULES, impacto/aceites em TRACEABILITY/BACKLOG e execução efetiva no ENGINE-HANDOFF. A contagem do Opus é referência de experiência, não quota de geração.

Atualização operacional 2026-10-24: mantenedor testou a biblioteca e relatou funcionamento mais leve e organizado. Adaptações de prompts e detecção local de rostos estão implementadas, com qualidade editorial ainda em revisão. Pedido posterior: Gerar cortes executa novamente sobre a fonte integral, sem veto pela biblioteca, publicando outra versão com ID/data novos e preservando as anteriores. A descoberta automática usa citações literais localizadas na fonte; personalizado mantém referências de linhas. SupoClip e AutoClip foram executados até MP4 com Qwen3.5-4B local nos vídeos inteiros de 10 e 24,6 min; quantidade/nota não são aceite de qualidade. Escopo/aceites no BACKLOG, estudo em OPEN-SOURCE-ENGINE-RESEARCH, regras em BUSINESS-RULES, rastreabilidade em TRACEABILITY e estado/evidências no ENGINE-HANDOFF. Nenhuma dessas verificações aprova automaticamente a edição, a qualidade dos títulos ou tracking animado.

Continuidade atual: mantenedor determinou Qwen3.5-4B exclusivo/32K, sem novos testes Qwen3 e com retirada do Gemma 4. Aprovou como referência editorial as seis propostas do assistente (duas dependem de imagem), registradas em docs/reports/evidence/criterio-editorial-assistente-2026-10-24.json. Isso não aprova saídas do Qwen. Migração/refino ainda em validação; estudos AutoClip/SupoClip, resultados e falhas no ENGINE-HANDOFF. Direção local preservada; comparações de API e proposta de seletor anterior ficam adiadas por essa nova decisão.

Comparação posterior Qwen3.5-9B autorizada e executada: não demonstrou o ganho editorial necessário, portanto não substitui o 4B. As seis referências não foram alcançadas pela descoberta automática. A comparação e os reparos de orquestração permanecem distintos de aceite editorial ou de uma entrega estável; estado atual no registro canônico.

> Ponto de entrada da inteligência de produto. **Não duplica especificações**: indexa os
> documentos canônicos e suas relações. Regra permanente de atualização incremental:
> toda mudança relevante em funcionalidade, fluxo, regra ou prioridade atualiza o documento
> canônico afetado e as referências aqui. Não reescrever tudo a cada tarefa.

## 1. Visão geral

CutNicePro: app desktop Windows local-first (hipótese DEC-001) que transforma vídeos longos
ou editados em cortes publicáveis — sugestões inteligentes, legendas automáticas,
reenquadramento por formato, exportação em lote — com o humano aprovando cada decisão e
processamento local verificável. Também um case profissional de Product Design (§8).

## 2. Objetivos e hipóteses vigentes

- Objetivos do usuário e do produto: PRD §5. Problema: PRD §1 (**HIPÓTESE — NEEDS VALIDATION**).
- Públicos: proto-personas (HYPOTHESIS) — PRD §2. Nenhuma pesquisa primária realizada.
- Hipóteses de UX H1–H7 e plano de validação: PRD §12 (nada executado).

## 3. Documentos canônicos

| Domínio | Documento | IDs |
|---|---|---|
| Requisitos | docs/product/PRD.md | FR-001..029, NFR-001..007 |
| Jornadas | docs/product/USER-JOURNEYS.md | JRN-001..014 |
| Regras de negócio + estados | docs/product/BUSINESS-RULES.md | BR-001..050; extensões BR-EDITOR-01..09 |
| Arquitetura da informação | docs/product/INFORMATION-ARCHITECTURE.md | — |
| Decisões | docs/product/DECISIONS.md | DEC-001..014 |
| Backlog | docs/product/BACKLOG.md | EPIC-001..012, US-001..037, AC-001..093; extensão do EPIC-008 |
| Rastreabilidade | docs/product/TRACEABILITY.md | AC-EDITOR-09; aceites e evidências das demais extensões |
| UX fundação (Fase 01) | docs/product/UX-FOUNDATION.md | §8 direção proposta |
| Marca | docs/brand/BRAND-FOUNDATION.md + design/tokens/ | — |
| UI Kit / diretrizes | docs/design/UI-KIT-ARCHITECTURE.md, NEXT-REVISION-GUIDELINES.md | — |
| Portfólio | docs/portfolio/CASE-STUDY-LOG.md | — |
| Visão histórica | docs/PRODUCT-BRIEF.md (superseded pelo PRD) | — |

## 4. Jornadas aprovadas

Nenhuma jornada está APPROVED — todas PROPOSED (aguardam avaliação do mantenedor).
Status por JRN em TRACEABILITY.md.

## 5. Regras de negócio — resumo de estado

50 regras (BR-001..050): APPROVED 7 (BR-031, BR-036, BR-037 modelo, BR-038, BR-041,
BR-048 princípio, BR-050) · PROPOSED 36 · PENDING TECHNICAL VALIDATION 7 (BR-006, BR-007,
BR-014, BR-018, BR-028, BR-034, BR-044 mecanismo) · pendências PENDING USER DECISION
embutidas em BR-037 (mecanismo), BR-048 (política pós-expiração) e BR-049 (offline).
Nenhuma contradição aberta detectada (auditoria de IDs 2026-10-17, Fase 02A.1).

## 6. Requisitos

FR: 29 no total (recalculado em 02A.1 — corrige a contagem anterior): MVP 23
(FR-001..016, FR-018, FR-022..FR-024, FR-026..FR-028) · MVP-hipótese 2 (FR-019, FR-029 —
DEC-013) · Comercial 1 (FR-025) · V1 3 (FR-017, FR-020, FR-021). NFR: 7. Detalhe no PRD
§8/§9; cobertura por história no BACKLOG/TRACEABILITY.

## 7. Decisões arquiteturais de produto

DEC-001..DEC-014 (docs/product/DECISIONS.md). Destaques: local-first (DEC-001, PROPOSED),
sem login no MVP (DEC-002, em reavaliação por DEC-011), modo B primeiro (DEC-003),
A/B exploração (DEC-006), **assinatura mensal sem créditos (DEC-010, APPROVED)**,
motores Local/BYOK (DEC-012, PROPOSED), fila sequencial MVP (DEC-013, hipótese) e preferência por Turbo com retirada do Large completo (DEC-014, APPROVED como decisão; implementação PENDING).

## 8. Dependências e pendências

**Prioridades vigentes do mantenedor — revisão documental 03N (2026-10-19):** o relato após 03M reabre qualidade da análise e enquadramento como defeitos. O resumo exibido continua metalinguístico/técnico; deve descrever a história e os acontecimentos concretos do trecho em linguagem natural. Escolher 9:16 não garante imagem preenchida: `isolatedClipSettings` usa `contain`; preencher/recompor sem faixas indevidas permanece pendente. Turbo é a escolha do mantenedor para ASR; retirar Large completo é decisão tomada, mas UI/backend ainda o suportam e não foram alterados nesta tarefa documental. Antes de futuras implementações, estudar os módulos dos projetos open-source indicados, conforme OPEN-SOURCE-ENGINE-RESEARCH.md. Não tratar as 247 aprovações de testes da 03M como aceite destes problemas.

- PENDING TECHNICAL VALIDATION: BR-006/007/014/018/028/034/044; mecanismo de storage
  (US-005: mecanismo já existe, mas recuperação integral ainda precisa validação); alvos de performance (NFR-002); fila/retomada integral de jobs (ASR já tem checkpoints locais); catálogo/compatibilidade de
  modelos locais (US-029/US-031, DEC-012).
- PENDING USER APPROVAL/DECISION: hipóteses do PRD, jornadas, regras PROPOSED,
  backlog/prioridades, direção UX (DEC-006); DEC-011 (mecanismo de acesso), preço/trial/
  dispositivos (DEC-010), política pós-expiração (BR-048), offline (BR-049), fila
  sequencial MVP (DEC-013).
- Poppins 500/600 já consta em `app/package.json` e fontes do render; a pendência antiga de instalação Medium/SemiBold não descreve o código atual. Eventual revisão visual segue docs/design/NEXT-REVISION-GUIDELINES.md.

## 9. Backlog (índice)

> Fase 03 (2026-10-18): marcos de entrega M1..M6 definidos no BACKLOG; **M1 IMPLEMENTADO**
> (app Windows Tauri + React/TS, Home, criar/listar/abrir projetos, persistência JSON
> local; evidências no relatório da fase). Stack técnica: Vite + React + TypeScript +
> Tauri v2 (Rust) — UI separada da lógica (comandos Tauri para persistência).



12 épicos, 37 histórias e 93 ACs de produto, com extensões técnicas rastreadas por entrega. Priorização e ordem em docs/product/BACKLOG.md. Estado de implementação misto: há código e execuções nativas reais; pendências/relatos mantêm editor e pipeline IN REVIEW. PLANNED descreve apenas itens ainda não implementados, não o aplicativo inteiro.

### Estado operacional atual, conferido no código (03N)

- React/TypeScript/Vite + Tauri/Rust; ver `app/package.json` e `app/src-tauri/Cargo.toml`. Não há integração Supabase ou stack remota implementada.
- Projetos/coleções e índice de mídia persistem no Rust; importação copia e deduplica por hash. Workspace v2 mantém `settings`, `videoSettings` e `clipEdits` em localStorage. Isso não equivale a backup ou versionamento completo.
- Transcrição local pt: whisper.cpp/DTW, Turbo padrão; escolha Large ainda existe no código. CPU/CUDA por descoberta; blocos centrais de 180 s com contexto de 2 s e cache validado. Não há retomada automática de qualquer estágio nem fila persistente geral.
- Clipes globais e por projeto; abrir é leitura, analisar é explícito; rejeição reversível sai dos ativos. Qwen3-4B textual escolhe candidatos em janelas e produz resumo/critérios; detecção FFmpeg refina transições locais. Nenhuma compreensão visual, diarização ou tendência externa implementada.
- Prévia de projeto usa origem; editor e cortes têm ajustes separados. Formato e preenchimento são controles distintos; `contain` atual explica faixas no 9:16. Crop/cover e ponto focal manuais existem; rastreamento de rosto/reenquadramento automático não.
- Render MP4 real com trim, legenda ASS e áudio; NVENC sondado e fallback libx264; TXT/SRT e cópia da origem são operações diferentes. Lote e histórico completo de exportação não concluídos.
- YouTube permanece referência/iframe, sem download local; BYOK, credenciais, colaboração e distribuição dos motores continuam pendentes.

Continuidade vigente: `docs/engineering/ENGINE-HANDOFF.md`. As entradas datadas da seção 11 e das fases abaixo são histórico, não configuração atual dos motores nem aprovação da qualidade.

## 10. Governança de artefatos visuais (Fase 02A.5)

Estados oficiais: **APPROVED** (aprovado expressamente pelo mantenedor) ·
**IN REVIEW** (tecnicamente validado, aguardando mantenedor) · **DRAFT**
(preliminar) · **REFERENCE** (apoio/exploração, sem autoridade) ·
**SUPERSEDED** (substituído por versão posterior aprovada) ·
**REJECTED/ARCHIVED** (reprovado ou histórico) · **BLOCKED** (pendência
crítica). Regra permanente: **apenas artefatos explicitamente APPROVED são
especificação visual definitiva para implementação**; Quality Gate PASS ≠
Product Design APPROVED; a documentação canônica prevalece sobre diagramas em
divergência (respeitando estado APPROVED/PROPOSED de cada decisão); conflito
entre decisões aprovadas → BLOCKED para resolução humana.

| ID | Nome | Tipo | Versão | FigCraft (página/frame) | Gate téc. | Mantenedor | Supersede | Canônicos | Elegível p/ implementação |
|---|---|---|---|---|---|---|---|---|---|
| ART-001 | User Journey Map — CUTNICEPRO END-TO-END | Journey map | 02A.1 | roadmap / frame 436 | n/a (pré-gate) | — | — | JRN-001..014 | Não (DRAFT/REFERENCE) |
| ART-002 | MASTER USER FLOW | User flow | 02A.1 | roadmap / frame 368 | n/a (pré-gate) | REPROVADO | — | JRN/BR/DEC | Não (REJECTED/ARCHIVED) |
| ART-003 | PRODUCT DELIVERY ROADMAP | Roadmap | 02A.1 | roadmap / frame 656 | n/a (pré-gate) | — | — | EPIC/US/DEC; BACKLOG.md | Não (DRAFT) |
| ART-004 | 00 — PRODUCT FLOW OVERVIEW V2 | Fluxo macro | V2 (02A.3) | roadmap / frame 728 | GATE V3 PASS (02A.4) | PENDING | candidata a superseder ART-002* | PRD §fluxo; JRN-001..013; DEC-012 | Não (IN REVIEW) |
| ART-005 | 01 — FIRST RUN & ACCESS USER FLOW V2 | User flow piloto | V2 (02A.3) | roadmap / frame 799 | GATE V3 PASS (02A.4) | PENDING | candidata a superseder ART-002* | JRN-001/002/014; BR-037/049; DEC-011/012 | Não (IN REVIEW) |
| ART-006 | Proposta A — Creative Studio | Proposta de UI | Fase 01 | UI - designer / frame 2 | n/a | — | — | UX-FOUNDATION §8 | Não (REFERENCE) |
| ART-007 | Proposta B — AI Clip Workspace | Proposta de UI | Fase 01 | UI - designer / frame 154 | n/a | — | — | UX-FOUNDATION §8 | Não (REFERENCE) |
| ART-008 | Home Galaxy CutNicePro | UI implementada | 03B | Home atual no app; origem UI - designer | Ver relatórios 03B | APPROVED em 2026-10-19 | — | JRN-001/002; FR-001/002 | Sim, Home aprovada pelo mantenedor |
| ART-009 | Entrada, projeto e editor | v1 REJECTED pelo mantenedor; correção v2 IN REVIEW | 03E v2 | Fonte própria: frames 2262/2440/2391; design/handoff/03d/flow-ui-v1.figcraft (rascunhos) | Build, 15 Rust e 13 runtime PASS (escopo) | PENDING HUMAN APPROVAL | — | UPLOAD-SCREEN.md; JRN-003/004/006/008/009 | Escopo de implementação autorizado; estética IN REVIEW |
| ART-010 | CutNice Pro — Product Design Case Study | Apresentação de portfólio | v4 + revisão UI Kit (2026-10-22), IN REVIEW | Mesmo design/case-study-v2/CutNicePro-Product-Design-Case-Study-v2.figcraft, página 05; UI Kit frame 1072 no final; outros slides preservados | UI Kit: 66 critérios; design/case-study-v4/ui-kit/validation.json | PENDING HUMAN APPROVAL | — | Roteiro e screenshots do mantenedor; sources.json | Não (apresentação, não especificação de produto) |

\* Journey Map (ART-001) e Product Flow Overview (ART-004) são artefatos
metodologicamente DISTINTOS (jornada × fluxo): um não supersede o outro. A
aprovação de ART-004/005 tornaria ART-002 SUPERSEDED (mesmo propósito: user
flow de referência visual) — hoje ART-002 permanece REJECTED/ARCHIVED.

Pendências por artefato: ART-004 → aprovação do mantenedor + D1 (ordem da
config de IA, PROPOSED no diagrama em âmbar). ART-005 → aprovação do
mantenedor + DEC-011 (mecanismo de acesso) + BR-049 (política offline;
detalhes PENDING USER DECISION). ART-003 → revisão contra BACKLOG.md quando
do próximo ciclo de planejamento. Próxima ação comum: auditoria/aprovação do
mantenedor; nenhum wireframe deve derivar destes artefatos antes de APPROVED.

## 11. Histórico de revisões — estado vigente nas seções 8 e 9

2026-10-19 — **M2A (Fatia 0+1 do motor) IMPLEMENTADA e validada no Tauri real
(16/16)**: importação persistente por cópia (hash SHA-256, integridade
bytes+re-stat, cancelamento, espaço), índice serializado com referências
explícitas por projeto, reconcile que ADOTA órfãos e suspende limpeza em
índice corrompido, análise ffprobe (-show_format -show_streams) persistida,
scheme cnplocal (Range/206 + ACAO eficaz p/ canvas), dialog nativo +
drag-and-drop REAL com paths, workspace v1→v2 (mediaId) com migração
preservando configurações. FFmpeg 9.0.2 documentado (fatos) em
ENGINE-DECISIONS.md; SPEC/critérios AC-R1..R5 em M2A-IMPORT-SPEC.md.
Estado visual: telas de upload/editor seguem PENDING HUMAN APPROVAL (sem
mudança de UI nesta fatia — apenas conexão real). Próxima: Fatia 2
(transcrição local, benchmark antes da escolha do motor).

2026-10-19 — Home aprovada expressamente pelo mantenedor (ART-008). Autorizada a implementação das telas de envio, preparação, visão do projeto e editor antes da integração do motor (ART-009). `docs/product/UPLOAD-SCREEN.md` registra escopo, limites de demonstração e rastreabilidade. Permanecem fora desta entrega: transcrição real, download de vídeo, render/export e integração Local/BYOK. A autorização específica não aprova globalmente as demais jornadas históricas.

2026-10-18 — **Decisão OPERACIONAL (não-produto): Protocolo Permanente de
Validação e Economia de Execução** (mantenedor): aprovação estética/visual é
exclusiva do mantenedor; subagente VISION proibido por padrão; validação
proporcional ao escopo com orçamento de execução (1 rodada + no máximo 1
repetição justificada); relatórios distinguem FUNCTIONAL/REGRESSION/VISUAL
status. Referência: `docs/engineering/VALIDATION-POLICY.md` + seção
`VALIDATION OWNERSHIP & EXECUTION BUDGET` no AGENTS.md. Nenhuma decisão de
produto/UX/comercial foi alterada por esta entrada.

2026-10-18 — Fase 03 (MVP freeze: D1 APPROVED, DEC-010 preço hipótese R$ 29,90,
DEC-011 convite beta, BR-049 offline técnico; baseline MVP v0.1 no PRD; marcos M1..M6;
M1 implementado) por ZCode. 2026-10-18 — Fase 02A.5 (governança de artefatos). 2026-10-17
— Fase 02A.1 por ZCode; aguardando avaliação.

2026-10-18 — Fase 02A.5 (governança de artefatos + organização da página
roadmap + índice visual; estados oficiais e regra de elegibilidade) por
ZCode. 2026-10-17 — Fase 02A.1 (modelo comercial + BYOK + jornadas/regras/
backlog expandidos + mapas visuais) por ZCode; aguardando avaliação.

## 12. Evidências

Relatórios de tarefa: docs/reports/ (LATEST.txt + history/). Evidências de design:
docs/reports/evidence/. Auditoria de consistência documental: TRACEABILITY.md §auditoria
(script de cross-check de IDs executado — resultado registrado lá).

## 13. Relação com o Graphify

Graphify: INSTALLED — INITIAL INDEX PENDING (código já existe; índice ausente na revisão 03N; docs/TOOLING.md).
PRODUCT-BRAIN ≠ grafo de código: durante a fase de produto, a rastreabilidade é a
documentação estruturada acima (IDs explícitos). A indexação da base existente e a integração
das relações de implementação ao Graphify permanecem pendentes, sem afirmar indexação automática sem evidência.

2026-10-19 — Revisão 03E: mantenedor rejeitou fluxo de criação vazia, preparação simulada e proporções da 03D. UPLOAD-SCREEN.md registra correção solicitada e aceites de viewport; v1 histórico rejeitado, v2 pendente de aprovação humana. Home continua aprovada.

2026-10-19 — Refinamento 03F de ART-009: modal de estilos e cursor/foco da timeline; UI ainda IN REVIEW. Estado e proposta de integração incremental do motor em docs/engineering/ENGINE-HANDOFF.md. Nenhuma IA instalada nem decisão de runtime/modelo promovida a aprovada.

2026-10-19 — Pesquisa solicitada pelo mantenedor: docs/references/OPEN-SOURCE-ENGINE-RESEARCH.md compara 10 projetos por aderência, adoção pública e licença. Integrações são propostas, sem substituir decisões canônicas ou autorizar instalação. Correção pós-M2A de nomes/YouTube/warnings registrada na SPEC; runtime dessa correção permanece PARTIAL.

2026-10-19 — Motor M3A inicial implementado por solicitação de ação imediata: whisper.cpp CPU + modelo Base multilíngue no workspace, transcrição pt, cancelamento, resultado persistido e integração aos painéis atuais. ENGINE-DECISIONS.md §5 e M3A-TRANSCRIPTION-SPEC.md registram arquitetura e limites. Mantenedor determinou testes em código, sem navegador/abertura do app; runtime, fluxo e qualidade ASR pendentes de sua verificação. Não conclui M3 completo, exportação ou escolha definitiva do modelo.

2026-10-19 — Mantenedor reportou erro de posições, ausência de modal/porcentagem e ruído técnico na UI da M3A. Correção consome callback oficial do CLI, adapta segmentos externos, mantém dado salvo estrito e remove detalhes internos/controles de exportação não implementados. Testes de código incluem markup estático em Node; nenhuma execução do app ou navegador. Aprovação do vídeo original e estética continuam pendentes. Referência: M3A-TRANSCRIPTION-SPEC.md §Correção.

2026-10-19 — Refinamento funcional do editor/transcrição: texto contínuo com rolagem interna, limpeza de marcadores de diálogo, palavras com tempos reais, cursor acessível com captura do ponteiro e geração local de miniaturas/onda em cache. Small é padrão provisório de desenvolvimento; sem benchmark nem promessa de precisão. Mantenedor reiterou que informações internas não pertencem à UI; não há aviso de modelo/migração/tempos antigos. Testes em código aprovados, sem app/navegador; runtime e estética continuam pendentes. Contrato e roteiro: EDITOR-TIMING-SPEC.md e EDITOR-TIMING-MANUAL-CHECK.md.

2026-10-19 — 03H, IN REVIEW: mantenedor rejeitou texto sempre expandido, botão Cancelar sem coerência e onda esparsa; relatou destaque interrompido e pediu edição por palavra, exclusão e bloqueio do menu nativo. Implementados seções recolhíveis, ação flutuante de palavra com seek e correção preservando tempo, alinhamento parcial, DTW, onda v2 densa, exclusão confirmada/retomável e bloqueio de contexto padrão. Large v3 Turbo substitui Small no desenvolvimento, sem afirmar qualidade comprovada. Nenhuma informação de modelo/migração entra na UI. 164 testes únicos aprovados; nenhum app/navegador controlado. Seções são extractivas por fala/pausa/duração, sem classificador semântico de ganchos. Referência vigente: EDITOR-USABILITY-SPEC.md e roteiro correspondente. Home preservada.

2026-10-19 — Mantenedor avaliou a transcrição como muito melhor e aprovou a área de texto da 03H, pedindo scroll refinado. Relato qualitativo, sem métricas inventadas ou aprovação global do editor. 03I IN REVIEW: avisos permanentes removidos; menus de projeto por contexto sem cobrir Novo, SRT/TXT e cópia da origem com seletor; fonte/estilos/efeitos persistidos; transporte e Espaço. Compartilhamento explicitamente adiado pelo mantenedor. ASR preservado. EDITOR-CONTROLS-SPEC.md e roteiro definem limites; 178 testes únicos de código aprovados, runtime/visual continuam humanos.

2026-10-19 — 03J IN REVIEW, autorizado pelo /start do mantenedor: legendas em janela
não modal móvel, clique/Espaço, controles de proporção/enquadramento/trim,
Ferramentas com Phosphor MIT, transcrição com progresso visual inteiro limitado
ao medido, confirmação de cancelamento e efeito pontilhado pausável. Adicionada
base funcional de cortes: fala + cenas reais, pontuação heurística explicável,
revisão persistente e render MP4 com legendas/áudio. Turbo preservado; pesquisa de
alternativas em ASR-QUALITY-2026-10-19.md. FFmpeg portátil apenas de desenvolvimento,
checksum conferido, sem alteração do sistema. 200 testes únicos em código PASS;
integração FFmpeg real com fixture sintética PASS; Tauri/fluxo/estética pendentes
do mantenedor. Não conclui histórico de versões, lote, rastreamento de rosto,
classificação semântica por LLM ou instalador. SPEC, roteiro e revisão em
EDITOR-AUTOCUT-*.md. Home e compartilhamento permanecem no estado anterior.

2026-10-19 — 03K IN REVIEW, autorizado por /start: biblioteca Clipes global e
Cortes por projeto, inspeção limitada ao trecho, leitura persistente independente
de localStorage, títulos extraídos do conteúdo inteiro e controles compartilhados
sem caixas do navegador. Dois Whisper selecionáveis; CUDA automático com alternativa
CPU. Quatro modelos avaliados em dez casos reais, sem referência humana de WER.
SPEC/aceite: docs/engineering/CLIP-LIBRARY-ASR-SPEC.md; revisão:
docs/engineering/CLIP-LIBRARY-ASR-REVIEW.md; resultados:
docs/references/ASR-BENCHMARK-2026-10-19.md. Aprovação visual pendente.

2026-10-19 — 03L IN REVIEW, correção autorizada por /start: prévia do projeto conserva a origem; editor do vídeo e edições de cada corte isolados; formato explícito na geração e na identidade/persistência do corte; seletor de modelo compacto; inspeção em parágrafos e análise semântica local do texto, com evidências e invalidação após alteração da transcrição. Qwen3-4B textual é separado de Whisper ASR, sem processamento concorrente pelo gate. 229 casos únicos de código aprovados e seis configurações Whisper válidas sobre 86 s reais. Abertura e palavrão confirmados pelo mantenedor ainda erram; prompts experimentais não adotados. Status funcional PARTIAL, regressão PASS no escopo e visual PENDING HUMAN APPROVAL. Referências: SOURCE-CLIP-ISOLATION-SPEC/REVIEW.md e ASR-REFINEMENT-2026-10-19.md. Nenhum épico promovido a aceito.

2026-10-19 — 03M IN REVIEW: abertura de clipes sem processamento automático; rejeição reversível retira da lista ativa; job identifica geração/análise/exportação. Seleção textual cobre a transcrição antes da decisão final; evidências por referência, falha isolada por clipe, aceleração Vulkan local, cenas regionais, checkpoints ASR e NVENC sondado. 247 casos únicos de código aprovados, com geração, retomada e exportação nativas reais. Tauri completo, precisão linguística, qualidade editorial e estética permanecem pendentes; nenhum épico promovido a aprovado. Referências: CLIP-PIPELINE-RELIABILITY-SPEC/REVIEW.md, OPUS-PIPELINE-RESEARCH-2026-10-19.md e evidência 2026-10-19-pipeline-validation.json.
