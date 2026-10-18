# CutNicePro — Registro de Decisões de Produto (DEC)

> Convenção leve de ADR (a cargo de `docs/product/`; amplia a prática já citada em
> AGENTS.md). Cada decisão: contexto → decisão → status. Não alterar retroativamente sem
> novo DEC registrando a mudança.

- **DEC-001 — MVP local-first para Windows.** Contexto: restrição de priorizar
  open-source/local (PRD §10) e processamento verificável. Decisão: aplicativo desktop
  Windows com pipeline local; web/SaaS é evolução (NFR-006). Status: PROPOSED
  (premissa revisável com avaliação técnica).
- **DEC-002 — Sem conta/login no MVP.** Contexto: evitar fricção de primeira execução
  (JRN-001) e dependência de servidores. Decisão: nenhuma autenticação obrigatória.
  Status: PROPOSED.
- **DEC-003 — Modos A/B/C com B como primeiro processamento ponta a ponta.** Contexto:
  modo B (legendas) entrega valor com menos incerteza técnica que A (seleção inteligente).
  Decisão: pipeline de jobs nasce com B; A entra em seguida na mesma arquitetura.
  Status: PROPOSED.
- **DEC-004 — Mídia referenciada, não copiada.** Contexto: vídeos são grandes; duplicar
  custa disco. Decisão: projeto referencia caminho+hash (BR-006). Status: PROPOSED +
  PENDING TECHNICAL VALIDATION.
- **DEC-005 — Pontuação heurística sem promessas.** Contexto: risco de marketing enganoso
  e quebra de confiança. Decisão: score é "potencial estimado" (BR-023). Status: PROPOSED.
- **DEC-006 — Propostas A/B = exploração; direção B-principal + A-avançado.** Contexto:
  Fase 01 produziu duas explorações visuais. Decisão: registrada em UX-FOUNDATION §8 como
  proposta, sujeita à Fase 02 visual. Status: PROPOSED.
- **DEC-007 — Repositório público com Conventional Commits.** Contexto: sync GitHub
  concluído em 2026-10-17. Decisão: histórico público, convenção permanente no AGENTS.md.
  Status: APPROVED (executado).
- **DEC-008 — Identidade oficial Poppins + paleta 4 cores.** Contexto: direção do
  mantenedor (BRAND-FOUNDATION). Decisão: tokens oficiais publicados. Status: APPROVED
  (aplicação visual pendente da Fase 02).
- **DEC-009 — Documentação canônica por domínio + Product Brain como índice.** Contexto:
  evitar redundância (regra da Fase 02A). Decisão: cada documento tem responsabilidade
  única; Brain indexa. Status: APPROVED (estrutura criada nesta fase).
- **DEC-010 — Comercialização por assinatura mensal sem créditos.** Contexto: definição
  explícita do mantenedor (2026-10-17, Fase 02A.1). Decisão: assinatura mensal libera as
  funcionalidades contratadas da plataforma completa; SEM créditos internos por
  corte/transcrição/exportação; modelo não depende de o desenvolvedor financiar inferências;
  processamento por IA local OU API própria do usuário (BYOK), com custos externos
  esclarecidos (custos do provedor da API ou dos recursos locais são do usuário).
  Preço, trial, política de dispositivos e licenciamento: PENDING USER DECISION.
  Status: APPROVED (modelo); detalhes pendentes registrados.
- **DEC-011 — Reavaliação do DEC-002 (sem conta/login).** Contexto: DEC-002 nasceu para o
  protótipo local; a assinatura comercial exige controle de acesso. Decisão: distinguir
  (a) protótipo interno de desenvolvimento — sem login; (b) MVP distribuído para teste —
  mecanismo a definir; (c) produto comercial — acesso vinculado à assinatura.
  Alternativas a avaliar (nenhuma escolhida unilateralmente): conta+autenticação; chave de
  licença; ativação por dispositivo; licença local com validação periódica.
  Status: PENDING USER DECISION. Nada implementado nesta tarefa.
- **DEC-012 — Arquitetura de experiência de IA: Local ou BYOK.** Contexto: DEC-010 exige
  mecanismo configurável. Decisão: etapa própria de configuração do motor (JRN-013),
  com escolha explícita local/BYOK, validação, teste e troca sem quebrar projetos
  (BR-046); matriz conceitual de capacidades por tarefa no PRD (sem fornecedores
  definitivos). Status: PROPOSED; compatibilidade de modelos PENDING TECHNICAL VALIDATION.
- **DEC-013 — Processamento sequencial em lote no MVP (hipótese).** Contexto: reavaliação
  do adiamento de lote (EPIC-010): o público-alvo trabalha com acervos. Decisão proposta:
  distinguir importação múltipla (MVP), fila sequencial (candidato a MVP), paralelismo
  (futuro) e exportação em lote (MVP). Status: PROPOSED — PENDING USER DECISION +
  PENDING TECHNICAL VALIDATION de recursos.

## Reavaliações da Fase 03 (2026-10-18 — aprovadas pelo mantenedor)

- **D1 — Ordem da configuração de IA: RESOLVIDA.** Decisão: o usuário chega à HOME sem
  ser obrigado a configurar motor de IA; a configuração é solicitada contextualmente ao
  iniciar funcionalidade que a exija. Fluxos de convite/ativação do beta podem preceder a
  Home para controle de acesso, sem exigir configuração técnica antecipada. Sem
  onboarding longo obrigatório. Status: **APPROVED** (atualiza a pendência "D1 a validar"
  da INFORMATION-ARCHITECTURE e a marcação PROPOSED do Overview V2).
- **DEC-010 (adendo) — Preço experimental.** R$ 29,90/mês registrado como **hipótese
  comercial APPROVED PARA TESTE** (não preço validado pelo mercado); detalhes (trial,
  dispositivos, licenciamento offline) seguem PENDING USER DECISION. Checkout/cartão:
  apenas sandbox com dados de teste; sem cobrança real e sem coleta de dados reais de
  cartão até integração com provedor.
- **DEC-011 (reavaliado) — Acesso do beta por convite.** Para o beta privado (10–20
  convidados), adotar **convite simples** (sem autenticação comercial completa no MVP
  técnico). Forma técnica exata: PENDING TECHNICAL VALIDATION; mecanismo comercial
  definitivo permanece PENDING USER DECISION.
- **BR-049 (reavaliada) — Offline.** Processamento local offline PERMITIDO quando
  tecnicamente viável; política comercial de validação de assinatura offline segue
  PENDING USER DECISION (não bloqueia o desenvolvimento técnico). Projetos nunca são
  apagados por falha de conexão.
- **Congelamento de escopo: CUTNICEPRO MVP v0.1 — SCOPE BASELINE** registrada no PRD §7
  (In Scope / Out of Scope / Validated / Pending Technical Validation / Pending
  Commercial Decision). Mudanças futuras: permitidas com registro de impacto no backlog.
- **Marcos de entrega M1..M6** registrados no BACKLOG (M1 = aplicativo Windows + Home +
  projetos + persistência — implementado nesta fase).
