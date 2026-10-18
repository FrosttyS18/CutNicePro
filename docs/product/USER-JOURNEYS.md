# CutNicePro — User Journeys (ponta a ponta)

> Jornadas JRN-001..JRN-011. Formato por jornada: ator, objetivo, gatilho, pré-condições,
> etapas (ação do usuário → resposta do sistema), estados observáveis, pontos de decisão,
> erros/exceções, resultado esperado, regras (BR), requisitos (FR) e critérios de sucesso.
> Não é uma lista de telas — a materialização de UI está em INFORMATION-ARCHITECTURE.md.

## JRN-001 — Primeira execução

> Fase 03: D1 RESOLVIDA — entrada direta na Home; configuração de IA apenas
> contextual (DECISIONS.md §Fase 03).

- Ator: novo usuário. Objetivo: entrar no produto sem fricção. Gatilho: instalação concluída + 1ª abertura.
- Pré-condições: Windows com requisitos mínimos (lista: PENDING TECHNICAL VALIDATION).
- Etapas: 1) abre o executável → app inicializa com verificação de ambiente (FR-001) e
  sinaliza problemas encontrados; 2) primeira execução é detectada (sem dados de usuário)
  → apresenta identidade + valor em até 3 painéis curtos OU entrada direta na Home vazia
  (ponto de decisão D1 abaixo); 3) configurações iniciais mínimas (nenhuma obrigatória no
  MVP — DEC-002); 4) chega à Home vazia com caminho único visível: criar o primeiro projeto.
- Estados observáveis: BOOT → READY (app); Home vazia (orientação + CTA).
- Pontos de decisão: D1 onboarding curto vs. entrada direta — hipótese: entrada direta com
  Home vazia autossuficiente (H1); a validar em teste. Evitar onboarding longo e cadastro.
- Erros/exceções: ambiente sem requisitos → mensagem com causa e ação; falha de
  inicialização → diagnóstico em arquivo de log (NFR-004).
- Resultado esperado: usuário na Home em < 1 minuto, sem conta (DEC-002).
- BR: BR-001, BR-002. FR: FR-001, FR-002. Sucesso: 1ª sessão gera criação de projeto (métrica futura).

## JRN-002 — Usuário recorrente

- Ator: usuário existente. Objetivo: continuar de onde parou. Gatilho: aberturas seguintes.
- Pré-condições: pelo menos um projeto persistido.
- Etapas: 1) abre o app → inicialização rápida sem reconfiguração; 2) Home lista projetos
  anteriores com metadados (atualização, estado); 3) recupera último estado salvo por
  projeto (FR-004); 4) reabre projeto → workspace restaurado; 5) acessa exportações
  anteriores (pasta do projeto).
- Estados observáveis: Home com projetos; item indisponível quando mídia sumiu (BR-032).
- Erros/exceções: projeto corrompido → diagnóstico + recuperação possível (BR-033);
  projeto ausente no disco → marcado, não removido silenciosamente.
- Resultado: retomada sem repetir configuração nem perder decisões.
- BR: BR-002, BR-004, BR-032, BR-033. FR: FR-002, FR-004, FR-016. Sucesso: tempo de retomada mínimo (H7).

## JRN-003 — Criação do projeto

- Ator: qualquer usuário. Objetivo: iniciar um trabalho. Gatilho: CTA na Home.
- Conceitos (definição normativa): **Projeto** = unidade de trabalho persistida (configurações,
  mídias, cortes, exportações); **Mídia de origem** = arquivo de vídeo importado/referenciado;
  **Corte** = derivado com timestamps de início/fim sobre uma mídia + ajustes (BR-019/BR-020).
- Etapas: 1) nomeia o projeto (gerado sugerido: "Projeto AAAA-MM-DD"); 2) define local de
  armazenamento (padrão: pasta do usuário no app; local-first); 3) confirma → projeto criado
  e entra no workspace vazio.
- Pontos de decisão: nome/local agora vs. depois (padrões sensatos — nada obrigatório além do nome).
- Erros: local sem permissão → mensagem e escolha de outro.
- Resultado: workspace de projeto pronto para importar.
- BR: BR-001, BR-002. FR: FR-003. Sucesso: criação em < 30 s sem ajuda.

## JRN-004 — Importação de mídia

- Ator: usuário no workspace. Objetivo: trazer vídeos. Gatilho: botão/dropzone/arrastar.
- Etapas: 1) seleciona 1..N arquivos; 2) sistema valida formato (BR-007) e detecta duplicatas
  (BR-008); 3) lê metadados técnicos (duração, resolução, codec) e detectção de áudio; 4)
  cria registros de mídia com progresso por item; 5) concluído → mídias READY.
- Estados: IMPORTING → ANALYZING → READY por item.
- Erros/exceções: codec não suportado / arquivo corrompido / sem áudio (bloqueia modo B com
  explicação — BR-009) / arquivo movido durante leitura; falha em um item não aborta os
  demais (BR-010); cancelamento preserva itens concluídos (BR-011).
- Resultado: mídias listadas com diagnóstico técnico visível.
- BR: BR-006..BR-011. FR: FR-005, FR-006. Sucesso: importação de lote sem interação extra.

## JRN-005 — Escolha do processamento

- Objetivo: declarar a intenção do trabalho. Gatilho: mídia pronta.
- Modos: **A — Cortes inteligentes** (analisar e sugerir melhores momentos); **B — Legendas
  automáticas** (legendar vídeo já editado sem alterar cortes); **C — Ajuste manual**
  (trabalhar direto num vídeo/corte).
- Pontos de decisão: C pertence ao MVP? Hipótese: A+B no MVP, C como caminho do editor
  avançado (Should) — decidir no backlog (EPIC-008). Nem todo usuário precisa da análise
  completa: B satisfaz o caso "só legendar" (tarefa de usabilidade planejada).
- Regra: escolha de modo é reversível; nada impede legendar depois um corte do modo A.
- BR: BR-012, BR-013. FR: FR-007. Sucesso: usuário distingue A/B na 1ª tentativa (H2).

## JRN-006 — Configuração da geração

- Etapas: definir quantidade de cortes, duração-alvo, idioma das legendas, formatos de saída,
  preset (opcional) e parâmetros avançados (recolhidos). Padrões: 1 vídeo → 4-6 cortes,
  30–90 s, idioma detectado, 9:16 — valores DEFAULT, não obrigatórios (só modo e idioma
  quando não detectável são obrigatórios).
- Erros: combinação impossível (ex.: duração-alvo > vídeo) → aviso pré-execução.
- BR: BR-012, BR-024. FR: FR-008. Sucesso: usuário roda com padrões sem editar nada (H2).

## JRN-007 — Processamento

- Etapas (por modo — nem todos os estágios rodam sempre, BR-013): preparação → análise
  técnica → transcrição (quando necessária) → identificação de trechos (modo A) → montagem
  das sugestões → preparação das legendas → geração de prévias → conclusão.
- Estados: QUEUED → PREPARING → ANALYZING → TRANSCRIBING → DETECTING → ASSEMBLING →
  CAPTIONS → PREVIEWING → COMPLETED (alternativas PARTIAL / FAILED / CANCELED — ver
  BUSINESS-RULES §Estados).
- Exceções: cancelamento marca CANCELED preservando parciais válidas (BR-015); falha parcial
  entrega o que concluiu (BR-016); recursos insuficientes → orientação (BR-017); retomada
  pós-reinício quando tecnicamente viável (BR-018, PENDING TECHNICAL).
- BR: BR-013..BR-018. FR: FR-009. Sucesso: progresso compreensível sem jargão (H3).

## JRN-008 — Resultados

- Etapas: visualizar cortes gerados (lista com prévia); comparar sugestões; selecionar;
  reproduzir prévia; aprovar/rejeitar; ajustar propriedades; preparar exportação.
- Pontos de decisão: pontuação de potencial é estimativa heurística — comunicada como tal,
  nunca como promessa de viralização (BR-023).
- BR: BR-019..BR-023. FR: FR-010. Sucesso: revisão de N cortes com poucos cliques (H4).

## JRN-009 — Edição avançada

- Etapas: abrir corte no editor; alterar in/out; ajustar legenda (texto/estilo/sincronia);
  ajustar reenquadramento (formato + foco); modificar áudio; pré-visualizar; salvar;
  retornar ao workspace.
- Regras: timestamps originais preservados — edição cria nova versão do corte (BR-020/BR-022);
  alterações não salvas sinalizadas ao sair; histórico por corte navegável.
- Erros: sair sem salvar → confirmação; falha ao salvar → versão anterior intacta (BR-033).
- BR: BR-020, BR-022, BR-025, BR-026. FR: FR-011..FR-013. Sucesso: correção de legenda em segundos (H5).

## JRN-010 — Exportação

- Etapas: selecionar cortes; formatos/qualidade; destino; legendas (embutidas ou .srt,
  BR-027); áudio; iniciar renderização; acompanhar fila; consultar resultados; abrir pasta;
  repetir quando necessário.
- Regras: nomenclatura padrão + nunca sobrescrever sem confirmação (BR-029); lote com
  progresso (BR-030); normalização/limpeza de metadados opcional sem alegação de
  originalidade (BR-031).
- BR: BR-027..BR-031. FR: FR-014, FR-015, FR-018. Sucesso: exportar lote e localizar arquivos sem busca manual (H6).

## JRN-011 — Continuidade e manutenção

- Cenários: fechar app durante processamento (job → CANCELED ou retomável — BR-015/BR-018);
  reiniciar e retomar (FR-016); vídeo de origem alterado/removido (BR-032); exportar
  novamente; duplicar projeto (FR-017); remover mídia do projeto; excluir projeto com
  confirmação (BR-005 — exports em disco não são apagados).
- BR: BR-005, BR-015, BR-018, BR-032..BR-034. FR: FR-016, FR-017. Sucesso: nenhuma perda silenciosa de trabalho (NFR-003).

---

## JRN-012 — Primeira ativação e licença (produto comercial — DEC-010/011)

- Ator: novo usuário do produto comercial. Objetivo: ativar o acesso. Gatilho: primeira
  abertura após a decisão comercial (fase pós-protótipo).
- Pré-condições: aquisição/assinatura (fluxo de compra FORA do app — não implementado aqui).
- Etapas: 1) abre o app → verificação de ambiente (JRN-001); 2) estado de acesso
  verificado → `PrimeiraAtivacao`; 3) ativa licença/conta (mecanismo PENDING USER DECISION
  — DEC-011); 4) sucesso → `AssinaturaAtiva` e segue para configuração de IA (JRN-013);
  falha → `FalhaValidacao` com causa e retry/restauração (BR-037).
- Estados: ver BUSINESS-RULES §Estados Comerciais. Nenhum estado apaga projetos (BR-048).
- Erros: validação falhou; sem internet na ativação → orientação (BR-049 proposto).
- Resultado: acesso ativo e caminho claro para o primeiro projeto.
- BR: BR-037, BR-048, BR-049. FR: FR-025. Sucesso: ativação sem suporte humano (hipótese).

## JRN-013 — Configuração do mecanismo de IA (Local ou BYOK — DEC-012)

- Ator: usuário com acesso ativo (ou protótipo). Objetivo: deixar o processamento pronto.
  Gatilho: primeira configuração, troca de motor ou tarefa sem motor compatível.
- **Subfluxo A — IA local:** abrir configurações de IA → escolher Local → identificar
  modelos disponíveis → verificar compatibilidade por tarefa (BR-042/matriz PRD §13) →
  verificar recursos → instalar/configurar modelo compatível quando necessário → testar
  execução → salvar preferência → usar no processamento. Decisões de modelos/formatos/GPU:
  PENDING TECHNICAL VALIDATION; não exigir GPU dedicada havendo alternativa viável.
- **Subfluxo B — BYOK:** selecionar provedor → informar chave própria → validar credenciais
  → consultar modelos (quando suportado) → ver tarefas cobertas → ser informado dos custos
  externos (BR-041) → salvar com segurança (BR-044 — nunca em logs/projeto/repo) → testar
  integração → usar no processamento.
- Estados: motor NÃO CONFIGURADO → CONFIGURADO → TESTADO → PRONTO (por tarefa); falha de
  configuração bloqueia apenas as tarefas dependentes (BR-045).
- Erros/exceções: modelo local ausente/incompatível; API inválida; limite do provedor;
  hardware insuficiente — todos com causa + ação; troca de motor preserva projetos (BR-046);
  fallback silencioso proibido (BR-047); selo LOCAL/EXTERNO sempre visível (BR-043).
- Resultado: processamento habilitado com transparência de execução e custos.
- BR: BR-039..BR-047, BR-050. FR: FR-022..FR-024, FR-026..FR-028. Sucesso: usuário
  configura e testa com 1 clique de confiança (H8 — nova hipótese).

## JRN-014 — Exceções comerciais e de motor (consolidado)

- Cenários mapeados com destino definido (nenhum beco sem saída):
  assinatura expirada → renovar/acesso limitado (política PENDING, BR-048); falha de
  validação → causa+retry; sem internet → cortesia proposta (BR-049); API inválida/limite
  externo → reconfigurar motor (JRN-013-B); modelo local ausente → instalar/alternar;
  hardware insuficiente → orientação (BR-017/BR-045); troca de mecanismo → BR-046.
- Regra transversal: diferenciar execução LOCAL de EXTERNA em toda comunicação (BR-043).
- BR: BR-037, BR-041, BR-043..BR-049. FR: FR-025..FR-028. Sucesso: toda exceção tem
  causa, consequência e próxima ação visíveis.

## Cobertura e lacunas

- Jornadas primárias: 001–010 (+012/013 para o produto comercial). Alternativas: embutidas
  (D1 onboarding; modos; cancelamentos; falhas parciais) + JRN-014 consolidado de exceções
  comerciais e de motor. Erro/recuperação: por jornada + JRN-011/014.
- Missing flows (pendências honestas): fluxo de atualização do aplicativo; instalação de
  dependências locais faltantes (depende de decisão técnica); mídia parcialmente legível;
  FLUXO DE COMPRA/ASSINATURA (checkout, cobrança, cancelamento pelo usuário) — fora do
  app nesta fase (DEC-010 define o modelo; mecanismo PENDING USER DECISION).
