# CutNicePro — Backlog

> Derivado de Problema → Jornada → Requisito → Regra → Épico → História → Aceite.
> Priorização MoSCoW justificada por valor/dependência/risco. Sem estimativas de horas
> inventadas (dependem de avaliação técnica). Estados: PLANNED (nada iniciado — não há código).

## EPIC-001 — Inicialização e Home
Objetivo: abrir o app e aterrissar com clareza. Valor: primeira impressão e retomada.
Jornadas: JRN-001/002. BR: BR-001, BR-002. FR: FR-001, FR-002. Prioridade: Must.
Conclusão: 1ª execução e Home (vazia/com projetos) funcionando de ponta a ponta.

- **US-001 — Verificação de ambiente na 1ª execução** (Must) — Como novo usuário, quero
  saber imediatamente se minha máquina suporta o app. Pré: instalação. BR-002/BR-035.
  AC: AC-001 inicialização sem dados de usuário detecta 1ª execução; AC-002 falta de
  requisito exibe causa e ação; AC-003 nenhum cadastro exigido (DEC-002). Dep: —.
- **US-002 — Home vazia com caminho único** (Must) — Como novo usuário, quero orientação
  clara para criar o 1º projeto. JRN-001. AC: AC-004 CTA "criar projeto" visível e único;
  AC-005 estados vazios conforme IA §4. Dep: —.
- **US-003 — Home com biblioteca e retomada** (Must) — Como recorrente, quero reabrir
  projetos com o último estado. JRN-002, FR-004. BR-004. AC: AC-006 lista com metadados e
  estado; AC-007 reabrir restaura estado; AC-008 item indisponível mostra diagnóstico
  (BR-032). Dep: EPIC-002.

## EPIC-002 — Projetos e persistência
Objetivo: unidade de trabalho durável. Jornadas: JRN-003/011. BR: BR-001..BR-005, BR-033.
FR: FR-003, FR-004, FR-016, FR-017. Prioridade: Must. Dep: EPIC-001 (parcial).

- **US-004 — Criar projeto** (Must) — AC: AC-009 criação por modal com nome sugerido;
  AC-010 local padrão alterável; AC-011 workspace vazio em seguida. BR-001.
- **US-005 — Persistência automática** (Must) — AC: AC-012 nenhuma ação do usuário exige
  "salvar projeto" (BR-002); AC-013 crash/reinício restaura último estado consistente
  (BR-033, NFR-003). PENDING TECHNICAL: mecanismo de storage local.
- **US-006 — Duplicar/excluir projeto** (Should, V1 — FR-017) — AC: AC-014 duplicação
  independente (BR-003); AC-015 exclusão com confirmação e preservando exports (BR-005).
  Atualização 03H: mantenedor antecipou exclusão em 2026-10-19. Código e testes de confirmação/limpeza compartilhada/recuperação implementados; aceite Tauri/visual pendente de sua conferência. Duplicação permanece pendente. EDITOR-USABILITY-SPEC.md.

## EPIC-003 — Importação de mídia

Entrega de interface 03C/03D (2026-10-19), autorizada pelo mantenedor: entrada, preparação demonstrativa, visão do projeto e editor de prévia implementados. O fluxo cria projetos no storage existente; renomeação persiste; configurações de interface são salvas por projeto. Referência e aceites específicos: `UPLOAD-SCREEN.md`. Esta fatia não conclui US-007/008/012/013: download, importação persistente da mídia, detecção de áudio, transcrição e render continuam pendentes. Projetos vazios legados e coleções são preservados.
Jornadas: JRN-004. BR: BR-006..BR-011. FR: FR-005. Prioridade: Must.

- **US-007 — Importar arquivos/lote** (Must) — AC: AC-016 seleção e drag-and-drop;
  AC-017 validação com causa na recusa (BR-007); AC-018 metadados + detecção de áudio
  exibidos; AC-019 progresso por item e cancelamento preservando concluídos (BR-011).
- **US-008 — Duplicatas e falhas por item** (Must) — AC: AC-020 duplicata sinalizada
  (BR-008); AC-021 falha por item não aborta lote (BR-010); AC-022 sem áudio bloqueia
  modos A/B com explicação (BR-009).

## EPIC-004 — Análise técnica da mídia
Jornadas: JRN-004 (ANALYZING). FR: FR-006. BR: BR-007, BR-032. Prioridade: Must.

- **US-009 — Diagnóstico técnico visível** (Must) — AC: AC-023 duração/resolução/codec/
  áudio consultáveis por mídia; AC-024 mídia removida vira UNAVAILABLE com revalidação
  por hash ao voltar (BR-032). Dep: EPIC-003.

## EPIC-005 — Núcleo de processamento + modo B (legendas automáticas)
Avanço M3A (2026-10-19): implementação inicial local para US-012/013, sem exportação, fila persistente ou avaliação de qualidade aprovada. Testes em código; runtime/fluxo reservados ao mantenedor. Contrato em `docs/engineering/M3A-TRANSCRIPTION-SPEC.md`.

Jornadas: JRN-005/006/007. BR: BR-012..BR-018, BR-024. FR: FR-007..FR-009, FR-012 (base).
Prioridade: Must. Decisão: DEC-003 (B primeiro).

- **US-010 — Escolher modo** (Must) — AC: AC-025 A/B/C apresentados com diferença clara
  (H2); AC-026 escolha reversível; AC-027 bloqueio de modos conforme áudio (BR-009).
- **US-011 — Configurar geração com defaults** (Must) — AC: AC-028 rodar sem editar nada;
  AC-029 avançados recolhidos; AC-030 aviso pré-execução em combinação impossível.
- **US-012 — Executar/monitorar job B** (Must) — AC: AC-031 estágios visíveis por modo
  (BR-013); AC-032 progresso sem jargão (H3); AC-033 cancelar preserva parciais (BR-015);
  AC-034 falha parcial entrega o concluído (BR-016); AC-035 fila por projeto (BR-014);
  AC-036 job gera registro técnico consultável (NFR-004).
- **US-013 — Legendas automáticas básicas** (Must) — AC: AC-037 legendas geradas com
  idioma confirmado quando ambíguo (BR-024); AC-038 correção manual de texto/tempo
  (BR-025); AC-039 exportar embutido ou .srt (BR-027).

## EPIC-006 — Cortes inteligentes (modo A) e revisão
Jornadas: JRN-007/008. BR: BR-019..BR-023. FR: FR-010. Prioridade: Must (A) — a seleção
inteligente é o coração da proposta de valor.

- **US-014 — Gerar cortes sugeridos** (Must) — AC: AC-040 cortes com ID estável (BR-019)
  e timestamps rastreáveis (BR-020); AC-041 prévia por corte; AC-042 score exibido como
  "potencial estimado" (BR-023).
- **US-015 — Revisar e decidir** (Must) — AC: AC-043 aprovar/rejeitar reversível (BR-021);
  AC-044 ordenar/filtrar por potencial/duração; AC-045 revisão de N cortes com poucos
  cliques (H4).
- **US-016 — Apenas legendar sem recortar** (Must — atalho do modo B sobre vídeo editado)
  — AC: AC-046 caminho "só legendas" alcançável sem passar por análise de cortes.

## EPIC-007 — Legendas avançadas
Jornadas: JRN-009 (parte legendas). BR: BR-026. FR: FR-012. Prioridade: Should (base Must no EPIC-005).

- **US-017 — Estilos de legenda** (Should) — AC: AC-047 estilos aplicáveis por corte;
  AC-048 posição/tipografia conforme tokens da marca.
- **US-018 — Animação por palavra** (Could) — AC: AC-049 ativar/desativar por corte com
  prévia fiel. Dep: validação técnica de render.

## EPIC-008 — Editor avançado
Jornadas: JRN-009. BR: BR-020, BR-022. FR: FR-011, FR-013. Prioridade: Should (Must para o
trim básico). Materialização: Proposta A como referência (DEC-006).

- **US-019 — Trim in/out com versionamento** (Must) — AC: AC-050 editar cria versão com
  histórico navegável (BR-022); AC-051 saída sem salvar avisa; AC-052 original rastreável
  (BR-020).
- **US-020 — Reenquadramento por formato** (Must) — AC: AC-053 alternar 9:16/1:1/16:9 com
  prévia fiel; AC-054 ajuste manual do enquadramento sempre possível.
- **US-021 — Foco em rosto (sugestão)** (Should) — AC: AC-055 sugestão de enquadramento
  aplicável/ajustável; falha silenciosa proibida (aviso quando não detectar).
- **US-022 — Áudio essencial** (Should) — AC: AC-056 normalizar loudness e redução de
  ruído como opções verificáveis por prévia.

## EPIC-009 — Exportação
Jornadas: JRN-010. BR: BR-027..BR-031. FR: FR-014, FR-015, FR-018. Prioridade: Must.

- **US-023 — Exportar seleção** (Must) — AC: AC-057 formato/qualidade/destino/legendas
  escolhíveis; AC-058 nomenclatura padrão sem sobrescrever sem confirmação (BR-029);
  AC-059 abrir pasta do resultado (FR-015).
- **US-024 — Fila e lote de exportação** (Must) — AC: AC-060 progresso por item; AC-061
  falha por item não aborta (BR-030); AC-062 repetir exportação.
- **US-025 — Normalização/limpeza de metadados** (Should) — AC: AC-063 opção técnica sem
  qualquer alegação de originalidade (BR-031).

## EPIC-010 — Lote de vídeos e refinamentos (V1)
Jornadas: JRN-004/007/010 em escala. FR: FR-019 (reclassificado pela DEC-013), FR-020,
FR-021. Prioridade: reavaliada — ver US-036.

- **US-026 — Processar múltiplos vídeos em paralelo** (Won't now — paralelização avançada;
  BR-014 revisão técnica) — AC: AC-064 jobs paralelos com recursos monitorados.
- **US-027 — Templates de marca** (Won't now) — AC: AC-065 presets de estilo salvos.
- **US-028 — Histórico de exportações** (Won't now) — AC: AC-066 exportações passadas
  consultáveis por projeto.
- **US-036 — Fila sequencial de processamento no MVP** (Should — HIPÓTESE DEC-013,
  PENDING USER DECISION + PENDING TECHNICAL VALIDATION) — Distingue importação múltipla
  (MVP, FR-005), fila sequencial (esta US), paralelismo (US-026) e exportação em lote
  (US-024). AC: AC-089 enfileirar N vídeos com progresso por item; AC-090 pausar/cancelar
  a fila preservando concluídos (BR-015); AC-091 falha em um vídeo não aborta a fila
  (BR-010/BR-030).

## EPIC-011 — AI Engine Setup (Local / BYOK)
Jornadas: JRN-013/014. BR: BR-039..BR-047, BR-050. FR: FR-022..FR-024, FR-026..FR-028.
Prioridade: Must (o pipeline não existe sem motor configurado). Dep: EPIC-001/002.

- **US-029 — Escolher e configurar IA local** (Must) — Como usuário, quero usar modelos
  locais compatíveis. Pré: acesso ativo/protótipo. AC: AC-067 descoberta de modelos
  instalados com compatibilidade por tarefa (BR-042); AC-068 verificação de recursos com
  orientação (BR-045); AC-069 teste de execução antes de salvar; AC-070 salvar preferência
  por tarefa. PENDING TECHNICAL: catálogo de modelos.
- **US-030 — Conectar API própria (BYOK)** (Must) — AC: AC-071 provedor+chave com validação
  real; AC-072 consulta de modelos quando suportado; AC-073 custos externos informados
  antes do uso (BR-041); AC-074 teste de integração com resultado visível.
- **US-031 — Segurança de credenciais** (Must) — AC: AC-075 chave nunca aparece em logs,
  arquivos de projeto ou repo (BR-044); AC-076 armazenamento seguro no Windows (mecanismo
  PENDING TECHNICAL VALIDATION); AC-077 remoção/rotação da chave pelo usuário.
- **US-032 — Transparência e troca de motor** (Must) — AC: AC-078 selo LOCAL/EXTERNO por
  tarefa em todo o processamento (BR-043); AC-079 troca de motor preserva projetos/cortes
  (BR-046); AC-080 nenhum fallback silencioso para API paga (BR-047).
- **US-037 — Falhas externas tratadas** (Must) — AC: AC-092 API inválida/limite/modelo
  ausente/hardware com causa e ação (BR-045/FR-027); AC: AC-093 bloqueio restrito às
  tarefas dependentes com alternativa quando viável.

## EPIC-012 — Assinatura e Acesso (produto comercial)
Jornadas: JRN-012/014. BR: BR-037, BR-038, BR-048, BR-049. FR: FR-025. Prioridade: Should
para o produto comercial (mecanismo PENDING USER DECISION — DEC-011; o protótipo interno
não implementa). Dep: decisão do mantenedor.

- **US-033 — Primeira ativação** (Should, comercial) — AC: AC-081 estados comerciais
  conforme BUSINESS-RULES (PrimeiraAtivacao→Ativa); AC-082 falha de ativação com causa e
  retry/restauração; AC-083 sem exigência de internet contínua (cortesia BR-049 proposta).
- **US-034 — Expiração/renovação sem perda** (Should, comercial) — AC: AC-084 expiração
  preserva projetos (BR-048); AC-085 renovação/restauração retorna ao estado ativo;
  AC-086 política de acesso pós-expiração aprovada pelo mantenedor antes da implementação.
- **US-035 — Comunicação sem créditos** (Must, comercial) — AC: AC-087 nenhuma interface
  sugere compra de créditos (BR-038); AC-088 custos externos esclarecidos quando BYOK
  (BR-041/FR-026).

## Marcos de entrega M1..M6 (Fase 03 — foco em entregas funcionais)

Mapeamento dos épicos/histórias existentes em incrementos demonstráveis. Sem datas e sem
estimativas de horas (sem análise técnica por história). Cada marco exige: resultado
funcional, histórias relacionadas, dependências, critérios de aceite, estratégia de
validação e evidência de funcionamento.

- **M1 — Aplicativo e projetos** (EPIC-001 parcial + EPIC-002 parcial): app Windows
  inicializável; Home funcional com estado vazio; criar/listar/abrir projetos;
  persistência local real; fechar e reabrir sem perder dados; erros básicos de
  leitura/gravação. Histórias: US-002, US-003 (parcial — lista e retomada básica),
  US-004, US-005 (parcial — storage definido: JSON local por comando Tauri). Validação:
  cargo test (persistência) + vitest (UI) + build desktop + execução real com evidências.
  **STATUS M1: IMPLEMENTADO (2026-10-18, Fase 03) — evidências no relatório da fase.**
- **M2 — Importação e mídia** (EPIC-003 + EPIC-004): importar vídeos reais, validar
  arquivos, metadados, preview, reprodução, associação a projetos.
- **M3 — Legendas e primeira exportação** (EPIC-005 + EPIC-009 parcial + EPIC-011
  mínimo): transcrição funcional, sincronização, edição de legenda, renderização,
  exportação MP4 real — primeiro ciclo útil ponta a ponta.
- **M4 — Cortes inteligentes** (EPIC-006): análise, trechos candidatos, seleção, revisão,
  ajustes, exportação dos cortes (qualidade/confiabilidade acima de quantidade).
- **M5 — Beta privado** (integração + EPIC-011 completo + US-036): fluxos integrados, IA
  local/BYOK nos provedores suportados, tratamento de falhas, fila sequencial,
  distribuição a 10–20 convidados (DEC-011 convite), feedback consentido, evidências de
  testes reais.
- **M6 — Preparação comercial** (EPIC-012): ativação, controle de assinatura, checkout
  com provedor real, renovação/expiração, experiência de conta, monitoramento mínimo.
  Não impede protótipos sandbox anteriores da experiência comercial.

Funcionalidades fora do MVP inicial (biblioteca de vídeos, colaboração, publicação
automática, paralelismo avançado, editor multipista, outras plataformas, créditos)
permanecem no roadmap — não no backlog prioritário do MVP.

## Ordem de entrega (vertical e incremental)

1. EPIC-001+002 (abrir/criar/retomar) → 2. EPIC-003+004 (importar/diagnóstico) →
3. EPIC-005 (jobs + modo B ponta a ponta; exige EPIC-011 mínimo: motor configurável) →
4. EPIC-006 (cortes + revisão) → 5. EPIC-009 (exportação — fecha o loop de valor) →
6. EPIC-008 (editor avançado) → 7. EPIC-007 (legendas avançadas) → 8. EPIC-011 completo
(descoberta/testes de motores, segurança de credenciais) → 9. EPIC-012 (assinatura, após
decisão do mantenedor) + US-036 (fila sequencial, hipótese DEC-013) → 10. EPIC-010 (V1).

Justificativa: cada incremento é utilizável e demonstrável (B entrega valor real antes de
A; exportação fecha o ciclo antes do refinamento de edição). Ordem a reavaliar com
viabilidade técnica (BR pendentes PENDING TECHNICAL VALIDATION).

## Bloqueadores e pendências técnicas

- Lista de formatos/codecs (BR-007/BR-028), mecanismo de storage local (US-005 —
  RESOLVIDO para M1: JSON local via comandos Tauri em app-data; evolução a DB quando
  mídia/jobs exigirem),
  retomada de jobs (BR-018), paralelização (BR-014/US-026) — PENDING TECHNICAL VALIDATION.
- Catálogo/compatibilidade de modelos locais e mecanismo de armazenamento seguro de
  chaves (US-029/US-031) — PENDING TECHNICAL VALIDATION.
- Mecanismo de acesso/assinatura, preço, trial, política de dispositivos e comportamento
  offline detalhado (EPIC-012) — PENDING USER DECISION (DEC-010/011).
- Fila sequencial no MVP (US-036) — hipótese DEC-013 aguardando decisão + validação técnica.
- Nenhuma história iniciada; nenhum código existe (estado PLANNED geral).

### Atualização 2026-10-19 — 03J: cortes e exportação em revisão

Autorização explícita do mantenedor antecipa implementação de US-014/015 e render
MP4 do EPIC-009: geração por heurísticas de fala/cena, sugestões com nota/razões,
filtro/ordenação, Aprovar/Rejeitar reversíveis e exportação de corte aprovado com
legendas. 200 testes de código PASS; fixture FFmpeg real PASS. Nenhum aceite no
Tauri/estético presumido. Histórico navegável de versões de corte, lote,
retomada de job, rastreamento de rosto e comparação ASR em fala real pendentes.
Compartilhamento continua adiado. SPEC/roteiro: EDITOR-AUTOCUT-*.md.

### Atualização 2026-10-19 — 03K: biblioteca e comparação ASR em revisão

JRN-003/006/007/008/009/010; FR-010/011/012/013/014/016/017;
BR-019..023/026..031; AC-040..045 parcial. A aba Clipes existente lista todos os
projetos; Cortes lista apenas o projeto atual. Galeria/inspeção substituem a lista
sob a transcrição. Estado salvo consultado no backend, inclusive sem preferências
no navegador. Títulos consideram o trecho inteiro; notas continuam estimativas
explicadas, sem tendência inventada. Dois perfis Whisper e detecção CUDA testados.
Quatro modelos e dez casos reais avaliados; precisão humana, GPUs menores que 8 GB,
adaptadores Qwen/Parakeet, empacotamento e aceite Tauri/visual permanecem pendentes.

### Atualização 2026-10-19 — 03L: origem, formato e análise em revisão

Correções solicitadas implementadas nos fluxos existentes de projeto, geração e inspeção; nenhuma galeria paralela criada. Formato por corte e isolamento das edições atendem aos aceites locais AC-03L-01..06 no nível de contratos; validação manual de interface pendente. EPIC-006/008/009 continuam IN REVIEW, sem aceite visual ou conclusão integral. Análise local de fala agora semântica com evidências, sem análise visual ou tendência. Precisão das frases ASR confirmadas ainda pendente após comparação real de Turbo/Large. Distribuição instalável dos motores e recuperação de preferências históricas já sobrescritas não são declaradas concluídas. Referências: SOURCE-CLIP-ISOLATION-SPEC/REVIEW.md.
