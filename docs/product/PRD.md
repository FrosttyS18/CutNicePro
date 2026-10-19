# CutNicePro — PRD (Product Requirements Document)

> Documento canônico de definição do produto. Status global: **PROPOSTO — aguardando aprovação do mantenedor**
> (readiness em `docs/product/PRODUCT-BRAIN.md`). Sucessor da visão inicial em
> `docs/PRODUCT-BRIEF.md` (mantido como registro histórico). IDs: FR/NFR aqui; JRN em
> USER-JOURNEYS; BR em BUSINESS-RULES; EPIC/US/AC em BACKLOG; DEC em DECISIONS.

## Estado de implementação e leitura deste PRD — revisão 03N, 2026-10-19

Este PRD define o produto desejado; presença de um requisito não comprova implementação ou aceite. Código atual: React/TypeScript/Vite + Tauri/Rust; cópia persistente de mídia, ASR Whisper local, seleção/análise textual Qwen e render MP4 FFmpeg. Fonte operacional e limites em ENGINE-HANDOFF.md; rastreabilidade em TRACEABILITY.md. BYOK, fila persistente/lote, histórico completo e reenquadramento por rastreamento continuam pendentes. Resultados de testes anteriores não aprovam qualidade editorial ou aparência.

Solicitações vigentes do mantenedor: análise deve narrar conteúdo concreto em linguagem natural, sem avaliação técnica genérica da fala; 9:16 deve compor/preencher o quadro para publicação preservando assunto e legenda; manter Turbo e retirar Large completo (DEC-014). São requisitos registrados, ainda não corrigidos no código por esta etapa documental. Fonte de exemplos: prints do mantenedor; não há métrica comparativa de precisão contra Opus validada.

## 1. Problema central (HIPÓTESE — NEEDS VALIDATION)

Criadores de conteúdo e operadores de perfis precisam transformar vídeos longos ou
previamente editados em cortes publicáveis, mas o processo de seleção, legendagem,
reenquadramento, revisão e exportação consome tempo e exige ferramentas distintas.

Investigações abertas (a validar com usuários reais):
- Tarefas mais custosas: seleção de momentos, legendagem e adaptação por formato.
- Automatizáveis: transcrição, sugestão de trechos, legendas, reenquadramento.
- Controle manual necessário: aprovação final, ajuste fino de corte/legenda.
- Erros de automação que minam confiança: legendas fora de sincronia, cortes com
  início/fim ruins, reenquadramento cortando o rosto — todos exigem caminho curto de correção.
- Lote eficiente: progresso visível, falha por item sem abortar o conjunto, retomada.
- Quando usar automação vs. editor tradicional: volume recorrente de conteúdo falado
  favorece automação; trabalho visual fino favorece editor tradicional.

## 2. Públicos candidatos (proto-personas — HYPOTHESIS, não personas validadas)

| Público | Hipótese de necessidade | Status |
|---|---|---|
| Criador individual de vídeos curtos | Volume semanal de cortes a partir de lives/podcasts | HYPOTHESIS |
| Operador de múltiplos perfis | Lote e repetição de processo padronizado | HYPOTHESIS |
| Editor freelancer | Entrega rápida com revisão controlada | HYPOTHESIS |
| Social media | Adaptação multi-formato (9:16/1:1/16:9) por plataforma | HYPOTHESIS |
| Criador de podcasts/entrevistas | Cortes de fala com legendas precisas | HYPOTHESIS |
| Pequena agência | Padronização e produtividade em equipe | HYPOTHESIS |

Nenhuma entrevista ou pesquisa primária foi realizada até 2026-10-17 (ver
`docs/portfolio/CASE-STUDY-LOG.md`). Tudo aqui é CONFIRMED apenas quando derivado de
decisão documentada do mantenedor; caso contrário ASSUMPTION/HYPOTHESIS.

## 3. Benchmark competitivo (pesquisa secundária, 2026-10-17)

| Produto | Verificado (fonte) | Implicação para o CutNicePro |
|---|---|---|
| OpusClip | Cortes por IA, legendas automáticas ~97% com destaque de palavras, auto-reframe com rastreamento de rosto, freemium com créditos/mês e marca d'água no plano gratuito ([opus.pro](https://www.opus.pro), [pricing](https://www.opus.pro/pricing), [review 2026](https://www.ssemble.com/blog/opus-clip-review-2026)) | Modelo de fluxo (gerar→revisar→exportar) é o parâmetro de mercado; diferencial local-first e sem créditos |
| CapCut Desktop | Auto-captions rápidas, edição por transcrição com remoção de muletas, marcadores/labels na timeline ([review jul/2026](https://bigvu.tv/blog/capcut-desktop-review-2026-features-pricing-smart-alternatives), [oficial](https://www.capcut.com/resource/how-to-use-capcut-on-pc)) | Padrão de editor acessível com timeline; cortes inteligentes não é o foco |
| Descript | Edição por transcrição (~95%), remoção de filler words, Studio Sound, gravação integrada ([descript.com](https://www.descript.com), [review mar/2026](https://www.notta.ai/en/blog/descript-review)) | Paradigma transcrição-first para conteúdo falado; reforça modo "legendas sem recortar" |

Inferências (não verificadas em teste): onboarding dos concorrentes tende ao upload
imediato; nenhum concorrente relevante é local-first sem nuvem. Não copiar interfaces,
fluxos proprietários ou identidade.

## 4. Visão

O CutNicePro é um aplicativo **desktop Windows local-first** (premissa, ver DEC-001) que
transforma vídeos longos ou já editados em cortes publicáveis — com sugestões inteligentes,
legendas automáticas, reenquadramento por formato e exportação em lote — mantendo o usuário
no controle de cada decisão e todo o processamento verificável na máquina local.

## 5. Objetivos

**Do usuário:** chegar do vídeo bruto a cortes publicáveis em menos tempo, com confiança
no resultado (revisar rápido, corrigir fácil, exportar sem retrabalho) e continuidade total
entre sessões.

**Do produto:** (1) primeiro corte utilizável com o mínimo de etapas; (2) nenhum progresso
perdido; (3) transparência de processamento; (4) fundação evolutiva para V1/web (NFR-006).

## 6. Proposta de valor

Contra o processo manual (N ferramentas + seleção assistida por olho + legenda manual +
export por formato): um único fluxo local, com IA propondo e humano aprovando, lote nativo
e sem dependência de nuvem/créditos. Contra editores tradicionais: especializado no job de
"transformar longo em publicável", não em edição visual geral.

## 6a. Modelo de negócio (DEC-010 — APPROVED pelo mantenedor em 2026-10-17)

**Software por assinatura mensal, sem créditos internos; processamento com recursos
locais ou APIs fornecidas pelo usuário (BYOK).**

- A assinatura libera as funcionalidades contratadas da plataforma completa.
- SEM créditos por corte, transcrição ou exportação (BR-038); o modelo não depende de o
  desenvolvedor financiar inferências dos clientes.
- Ressalva comercial obrigatória em qualquer comunicação: ausência de créditos internos ≠
  ausência de custos externos — provedor de API pode cobrar pelo consumo; IA local consome
  recursos da máquina (BR-041). Nunca anunciar "processamento ilimitado/grátis" sem
  esclarecer limitações externas e técnicas.
- PENDING USER DECISION: preço, trial gratuito, política de dispositivos, detalhes de
  licenciamento e mecanismo de acesso (DEC-011). Nada implementado nesta fase.

Escopo por fase do produto: protótipo interno sem login (DEC-011a); MVP distribuído com
mecanismo a definir; produto comercial com assinatura.

## 7. Escopo

### CUTNICEPRO MVP v0.1 — SCOPE BASELINE (Fase 03, 2026-10-18)

Congelamento de escopo para construção (não proíbe evolução; mudanças futuras registram
impacto no BACKLOG). Marcos de entrega M1..M6 detalhados no BACKLOG.

- **In Scope (MVP):** aplicativo Windows local-first; importação de vídeos; geração
  inteligente de cortes; legendas automáticas; revisão; edição essencial; ajuste de
  enquadramento; exportação MP4; persistência de projetos; fila sequencial de
  processamento (DEC-013); IA LOCAL e BYOK (conjunto restrito validado — DEC-012);
  assinatura mensal sem créditos (DEC-010) com checkout sandbox para protótipos.
- **Out of Scope (fora do MVP inicial; permanecem no roadmap):** biblioteca de vídeos por
  nicho; colaboração em equipe; publicação automática em redes; processamento paralelo
  avançado; editor multipista completo; outras plataformas; integrações não essenciais;
  sistema de créditos internos.
- **Validated (decisões aprovadas):** DEC-010 modelo sem créditos; preço R$ 29,90/mês
  COMO HIPÓTESE DE TESTE; D1 Home antes da config de IA; DEC-012 Local/BYOK (matriz
  conceitual); DEC-002 (sem login no MVP técnico); DEC-013 fila sequencial (hipótese de
  MVP sujeita a validação técnica).
- **Pending Technical Validation:** formatos/codecs (BR-007/028); mecanismos de motores
  locais/BYOK por tarefa (transcrição, alinhamento, seleção, análise visual,
  reenquadramento); armazenamento seguro de credenciais (BR-044); retomada de jobs
  (BR-018); desempenho de fila sequencial.
- **Pending Commercial Decision (PENDING USER DECISION):** mecanismo de acesso
  definitivo (DEC-011 — beta usará convite simples); política offline detalhada (BR-049);
  trial/dispositivos/licenciamento; provedor de pagamentos; detalhes pós-expiração
  (BR-048).
- **Não prometido:** compatibilidade com qualquer modelo de IA; processamento ilimitado;
  uso do GLM Coding Plan como API comercial de inferência (BR-050); métricas de
  usabilidade ainda não coletadas.


### MVP (Must)
FR-001 a FR-016 (abaixo), um vídeo de origem por job, modos B (legendas) e A (cortes) com
pipeline completo, editor avançado essencial, exportação local.

### Versão 1 (Should/Could)
FR-017 a FR-021 + refinamentos de lote, histórico de exportações, templates.

### Evoluções futuras (não comprometidas)
Plataforma web/SaaS, colaboração, multi-perfil com bibliotecas compartilhadas, dublagem/tradução IA.

### Explicitamente fora de escopo (agora)
Burlar sistemas de reconhecimento de conteúdo; garantia de viralização/monetização;
processamento em nuvem obrigatório; conta/login como requisito do MVP (DEC-002).

## 8. Requisitos funcionais (FR)

| ID | Requisito | Escopo |
|---|---|---|
| FR-001 | Inicialização com verificação de ambiente (dependências locais, permissões, espaço) e primeira execução distinguível de execuções seguintes | MVP |
| FR-002 | Home com biblioteca de projetos: vazia (orientação + criação), com projetos (continuidade) e itens indisponíveis (diagnóstico) | MVP |
| FR-003 | Criação de projeto: identificação e local de armazenamento | MVP |
| FR-004 | Reabertura de projeto restaurando o último estado salvo | MVP |
| FR-005 | Importação de mídia: seleção (arquivo/lote), validação de formato, leitura de metadados, detecção de áudio, progresso e cancelamento | MVP |
| FR-006 | Registro de mídia com estados e diagnóstico técnico (BR-007…BR-011) | MVP |
| FR-007 | Escolha de modo de processamento: A cortes inteligentes / B legendas automáticas / C ajuste manual | MVP (C pode ser Should — ver backlog) |
| FR-008 | Configuração de geração com padrões sensatos: quantidade, duração-alvo, idioma, legendas, formatos; só o essencial é obrigatório | MVP |
| FR-009 | Execução e monitoramento de jobs: estágios visíveis, progresso, cancelamento, falha parcial, repetição | MVP |
| FR-010 | Resultados de cortes: lista com prévia, pontuação editorial estimada (BR-023), resumo concreto do conteúdo em linguagem natural, aprovação/rejeição, seleção | MVP |
| FR-011 | Editor avançado do corte: trim in/out, legendas, reenquadramento, áudio, histórico de versões do corte | MVP |
| FR-012 | Legendas: edição manual, estilos, sincronização, animação por palavra (animação = Could) | MVP |
| FR-013 | Reenquadramento 9:16 / 1:1 / 16:9, com composição/preenchimento apropriados ao formato de publicação; foco em rosto como sugestão aplicável | MVP (foco em rosto = Should; formato isolado não comprova preenchimento) |
| FR-014 | Exportação: seleção de cortes, formato/qualidade, destino, nomenclatura, fila com progresso e lote | MVP |
| FR-015 | Acesso pós-exportação: abrir pasta do resultado e repetir exportação | MVP |
| FR-016 | Persistência e recuperação de estado: fechamento/crash sem perda de decisões do usuário | MVP |
| FR-017 | Duplicação e exclusão de projeto com confirmação | V1 |
| FR-018 | Normalização técnica e limpeza de metadados na exportação (sem alegações de originalidade) | MVP |
| FR-019 | Processamento em lote: fila sequencial de múltiplos vídeos (DEC-013 — hipótese MVP) | MVP-hipótese |
| FR-020 | Templates/presets de estilo de marca | V1 |
| FR-021 | Histórico de exportações por projeto | V1 |
| FR-022 | Configuração do motor de IA local: escolha, descoberta de modelos compatíveis, verificação de compatibilidade/recursos e teste de execução | MVP |
| FR-023 | Configuração BYOK: provedor, chave do usuário, validação, consulta de modelos quando suportada e informação de custos externos | MVP |
| FR-024 | Armazenamento seguro de credenciais no Windows (nunca em logs/projeto/repo) | MVP |
| FR-025 | Estados comerciais de acesso: ativação, ativa, expirada, falha de validação, offline (cortesia proposta), renovação e restauração | Comercial (pós-protótipo; mecanismo PENDING USER DECISION) |
| FR-026 | Transparência de execução e custos: selo LOCAL/EXTERNO por tarefa + aviso de custos externos do provedor | MVP |
| FR-027 | Tratamento de falhas externas: API inválida, limite do provedor, modelo ausente/incompatível, hardware insuficiente — com causa e ação | MVP |
| FR-028 | Troca de motor de IA (local↔BYOK) preservando projetos e cortes | MVP |
| FR-029 | Importação múltipla + fila sequencial de processamento (hipótese DEC-013; paralelismo = futuro) | MVP-hipótese |

## 9. Requisitos não funcionais (NFR)

| ID | Requisito |
|---|---|
| NFR-001 | Local-first: processamento na máquina, sem nuvem obrigatória (DEC-001) |
| NFR-002 | UI responsiva: jobs nunca bloqueiam a interface (alvos numéricos: PENDING TECHNICAL VALIDATION) |
| NFR-003 | Recuperação: nenhuma decisão do usuário perdida por falha/fechamento |
| NFR-004 | Verificabilidade: cada job produz registro técnico consultável |
| NFR-005 | Acessibilidade: navegação por teclado e contraste conforme tokens da marca |
| NFR-006 | Portabilidade futura: camadas separadas (regras/processamento/UI) sem compromisso web agora |
| NFR-007 | Direitos: responsabilidade de uso da mídia é do usuário; nenhuma promessa de burlar reconhecimento |

## 10. Restrições conhecidas

- Prioridade a soluções locais e open-source; dependências comerciais exigem justificativa (DEC).
- GLM Coding Plan auxilia o desenvolvimento; **não** é API de produção do produto.
- Processamento de vídeo deve ser verificável (NFR-004).
- Limpeza de metadados não garante originalidade nem monetização (BR-031).
- Premissa Windows local-first é hipótese revisável (DEC-001).

## 11. Critérios de sucesso (metas candidatas — NÃO resultados observados)

| Métrica | Meta candidata | Justificativa |
|---|---|---|
| Tempo até o 1º corte utilizável | A definir após teste de benchmark técnico (PENDING) | Depende do pipeline local |
| Tempo de preparo de um lote | A definir (PENDING) | Mede fricção de configuração |
| % de cortes exigindo correção manual | Alvo decrescente versão a versão | Qualidade das sugestões |
| Taxa de exportações concluídas sem erro | Próxima de 100% | Confiabilidade |
| Frequência de erros de processamento | Registrada desde o dia 1 (NFR-004) | Base de melhoria |
| Facilidade de retomar projeto | Validar em teste de usabilidade planejado (§12) | Continuidade |

Nenhum número acima é resultado; são metas a fixar com base técnica e de pesquisa.

## 12. Pesquisa e validação de UX (plano — nada executado ainda)

Hipóteses a validar (H1–H7): iniciar o 1º projeto sem instruções; compreensão dos modos
A/B/C; clareza dos estados de progresso; revisão rápida de cortes; sensação de controle
sobre sugestões da IA; exportação sem fricção; recuperação de erros sem perda.

Tarefas de usabilidade para protótipos futuros: criar um projeto sem ajuda; importar um
vídeo; encontrar o modo "apenas legendar"; identificar um corte que precisa de ajuste;
exportar vários vídeos; recuperar um projeto anterior.

**Nenhum teste de usabilidade foi realizado nesta fase** ( registrar execução futura em
`docs/portfolio/CASE-STUDY-LOG.md`).

## 13. Arquitetura do mecanismo de IA — matriz conceitual (DEC-012)

Motor de IA = escolha configurável: **Local** (modelos compatíveis instalados pelo usuário)
ou **BYOK** (API própria). Não se pressupõe um único modelo para todas as tarefas;
compatibilidade e fornecedores: PENDING TECHNICAL VALIDATION (nenhum escolhido).

| Tarefa | Local (hipótese) | BYOK (hipótese) | Dependências |
|---|---|---|---|
| Reconhecimento de fala (transcrição) | Modelos locais de ASR compatíveis | APIs de transcrição do provedor | BR-042; qualidade a validar |
| Alinhamento de legendas (timestamps por palavra) | Derivado do ASR local | Derivado do ASR do provedor | Precisão do alinhamento a validar |
| Seleção inteligente de trechos | Análise local (transcrição+heurísticas) | LLM/API de análise textual | Depende de transcrição; BR-023 |
| Interpretação visual (cenas/rostos) | Modelos locais de visão | APIs de visão (se suportadas) | PENDING TECHNICAL |
| Reenquadramento/reframe | Processamento local determinístico + foco em rosto local | N/A (processamento local) | Foco em rosto = Should |
| Processamento/renderização | Local (FFmpeg-class), sempre | N/A — sempre local | Verificável (NFR-004) |

Regras de experiência: etapa própria de configuração (JRN-013); teste antes do uso; selo
LOCAL/EXTERNO por tarefa (BR-043); falhas de motor com causa/ação (BR-045); troca sem
quebrar projetos (BR-046); GLM Coding Plan não é provedor válido (BR-050).
