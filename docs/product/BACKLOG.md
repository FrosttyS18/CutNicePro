# CutNicePro — Backlog

Estado vigente2026-10-28, Complemento36/M9: meta PAUSED por pedido do mantenedor após confirmar "funcionou bem" para destino direto/60fps. Modal, seletores e repetição rápida também confirmados. Build padrão25,98s sem warnings; log real da exportação validada47,37s, com composiçãoCPU/CUDA por janela e h264_nvenc. Não é A/B controlado nem promessaGPU100%.36Rust/97TS relacionados aprovados nesta extensão; evidências/contratos no ENGINE-HANDOFF. Sem commit/push/bump; mudanças locais não indexadas, `.zcode/config.json` preexistente preservado. Na retomada revisar estado/fila com o mantenedor, sem repetir aprovados. HEVCAlpha indisponível, redes sociais/ASR aplicado/compositor próprio e gates amplos continuam separados; não iniciar enquanto pausada.

Retomada vigente2026-10-28: seguir Complemento33/M8; pausa abaixo é histórica. Política escalável até16CPUs e composiçãoCUDA limitada integradas, com fallback por janela. Export integral161,833s/4855frames em38,740s contra73,497s no controleCPU otimizado; PCM/ASS idênticos e conteúdo de todos os frames comparado.67 casos únicos relacionadosPASS e build padrão sem warnings. Mantenedor confirmou exportação normal rápida e correta; aceite registrado sem extrapolar para os gates amplos do editor. Consolidar estudoASR local/online com REA/Ghidra antes de propor mudança emWhisper. Cache, compositor próprio, classificação ampla de falhas e modal de configurações continuam propostas distintas. Demais pendências do editor/segurança/labs e aceite humano anterior permanecem abertas.

Checkpoint vigente2026-10-28: rodada de estudo/auditoria encerrada para pausa solicitada; nenhuma implementação adicional. M6/exportCapCut: investigação estática delimitada entregue, matriz14etapas/84dossiês; runtime, pixels, GPU ativa/cachehit e comparação30s continuam não medidos. Auditoria Graphify de duplicação parcial na cobertura34findings/92locais; preservar referências históricas e materiais independentes, sem refatoração automática. Pendência P1 condicional: isolar/proteger `m1-desktop.e2e.mjs` e `phase03b-desktop.e2e.mjs` antes de executar, pois removem dados reais e compartilham porta9333. Não executar para comprovar a remoção. Pendências M0/M5/M6/M7, reteste humano de export/X e desempenho anterior permanecem; aguardar ordens. Detalhe canônico no Complemento32 do ENGINE-HANDOFF.

Continuação vigente2026-10-27: Complemento31 entrega correção de legendasTS/ASS, riscos de fechamento e nova redução do render. Montagem integral161,833s/4855frames:131,58s comNVENC; reteste anterior173,08s. Cues/destaques conferidos em4855frames, sem divergência;77TS/80Rust distintos relacionadosPASS e build padrão aberta. Mantenedor está exportando: aguardar seu relato sem mexer nas fontes nem iniciar cargas que alterem a medição. FechamentoX e aparência/sincronização final aguardam teste humano. GargaloCPU da composição permanece; não prometer os30s do CapCut. EstudoREA/export trouxe configuração de ramo paralelo/fila/retry, sem comprovar modoGPUativo. Próxima melhoria de render deve isolar custo decode/composição/ASS e validar fidelidade/fallback antes de ampliar aceleração. Sem commit/push nesta fatia; meta integralACTIVE/PARTIAL. Lacunas anteriores de797MB/ASR/modais/gates amplos continuam documentadas.

Atualização vigente2026-10-27 — entrada direta no Editor e correções da fila implementadas, em teste humano. Ícone Editor abre montagem vazia identificável em Meus projetos; ASR é explícito por mídia, sem iniciar na importação. EOF→imagem/áudio, escala800%/campos, zoom/pan/minimapa somente de visualização e rodapé de mídia corrigidos. Contratos BR/AC-EDITOR-10/11, JRN-009; evidências e limites no ENGINE-HANDOFF Complemento24. Suítes1267TS/374Rust passaram,33opt-in ignorados; build normal recompilada, sem commit/push. Aceite WebView/ASR real/visual e797MB pendentes. Pesquisa ampla anterior continua adiada; esta entrega não encerra o editor integral. Refinamento adicional da mesma fatia: snap visual/magnético de centros e bordas ao arrastar, com Alt para ajuste livre, e clique no vazio limpando a seleção real sem mover cursor ou gravar. Ver BR/AC-EDITOR-11 e Complemento24.

> Derivado de Problema → Jornada → Requisito → Regra → Épico → História → Aceite.
> Priorização MoSCoW justificada por valor/dependência/risco. Sem estimativas de horas
> inventadas (dependem de avaliação técnica). Há código implementado e itens ainda PLANNED; IN REVIEW não equivale a aceite do mantenedor. Estado operacional e histórico de entregas são distintos.

## Auditoria de segurança — primeira passada, 2026-10-27

Retomada da meta do editor autorizada posteriormente em 2026-10-27: a pausa e a auditoria abaixo continuam registros históricos. O checkpoint anterior de fonte/zoom foi publicado em `b7092359faeb03828d0b59b6f7206d7aee0485b0` e confirmado no Graphify remoto, liberando a fatia de marcadores, organização da timeline e metadados das faixas. Esses recursos não existiam no Complemento21; a implementação posterior está IN REVIEW, com meta ACTIVE/PARTIAL. Contrato vigente: BR-EDITOR-09 e AC-EDITOR-09, JRN-009/EPIC-008, no plano existente.

Direção aprovada: M/segundo M/duplo clique editam anotações absolutas de nome/tempo/cor, com exclusão e histórico; pós-fim não altera duração/render, e extrair clipe filtra/rebasa os marcadores. Nome/cor das faixas preservam identidade, mídia e composição. Nome limitado a 120 caracteres Unicode, contador visível/clamp na UI, validação TypeScript/Rust e texto JSX literal estão implementados/testados. A timeline abre maior, centraliza poucas faixas e mantém a principal na base com linha sutil de 1px; drops não atravessam a principal para faixas atrás. Checkpoint técnico: suíte integral 1.160 TS e 359 Rust aprovados, 33 opt-in ignorados, build/lint aprovados. O relato de M perder foco após duplo clique → Excluir foi reproduzido e corrigido; a verificação posterior passou 34/34 afetados, incluindo um caso novo, somando 1.161 casos únicos cobertos sem nova suíte integral. As três passagens Terra sobre fixtures, com ausência de colisões no escopo final, não validam o app normal nem aprovam a estética. Código desta fatia implementado/testado, com reteste humano pendente. Jornada normal, vídeo de 797MB e gates globais M0/M5/M6/M7 permanecem abertos; não retomar pesquisa ampla por consequência desta fatia.

Estado **PARTIAL**, sem alteração funcional nem retomada da meta do editor. A skill oficial Cloudflare foi aplicada ao código `48aeca4`: zero vulnerabilidades confirmadas; uma hipótese de leitura `cnplocal` por origem remota exige validação independente das pré-condições e do runtime. Falta de Origin/CSP isoladamente não comprova vazamento. Continuidade e evidências no ENGINE-HANDOFF Complemento20 e no tooling.

- Validar em ambiente descartável isolado se uma origem remota consegue ler somente uma mídia sintética registrada, distinguindo script controlado, seletor conhecido e políticas do WebView2. Nunca usar a sessão normal nem desabilitar segurança do navegador para obter resultado positivo.
- Aprofundar proxy/cache `cnpmedia` da Home: limites de resposta, redirecionamento, concorrência, cancelamento e uso de recursos. Cobertura pendente, sem indisponibilidade demonstrada.
- Verificar os acessos secundários que mídia não confiável pode induzir em FFmpeg/FFprobe nas chamadas do aplicativo. Não confundir o controle do caminho primário com contenção do decoder; nenhum acesso não autorizado foi observado.
- Revisar exclusão de projetos, retomada por marcador, reconciliação e derivados, separadamente do purge de clipes já examinado. Preservação de originais/mídia compartilhada e promessas reais de retenção orientam os critérios; inconveniência do mesmo usuário não é automaticamente falha de segurança.
- Avaliar CSP e vínculo explícito de origem como proteção adicional, com testes dos consumidores antes de alterar: mídia/blob, Home e projetos legados. Uma alteração funcional futura deve consultar impacto atual e manter compatibilidade.

Os testes controlados do alvo ficaram bloqueados pela ausência do isolamento OS completo exigido pela skill. Revisão de fonte/JSON e busca por padrões de segredos não substituem essa etapa nem um scan completo de dependências. Não foram criadas severidades ou declarações de segurança para áreas não testadas.

## Fila adicional do mantenedor — 2026-10-26

Fila atual antes da pausa solicitada: imagem/trechos curtos na timeline; lixeira7dias e filtros atuais; importar paraMídia e arrastar para timeline/desdeWindows; renovar Novo/tempo ao salvar edição manual; commits e push para o Graphify. Implementação e testes em consolidação, com reteste visual/Windows ainda do mantenedor. Depois dessa entrega, a meta integral deve ficar PAUSED por pedido explícito, preservando as lacunas abaixo para retomada. Não iniciar novas pesquisas CapCut nem o laboratório797MB antes de retomar.

Ordem expressa: terminar a fatia ativa de legendas por camada, transcrição por ocorrência e cancelamento de processos próprios; depois executar os itens abaixo, sem abandonar o objetivo integral do editor. A regressão automatizada anterior passou antes de iniciar esta fila. Os itens 1/2 agora estão IMPLEMENTADOS EM REVISÃO; visual e uso normal ainda dependem do mantenedor.

1. **Modal de clipe editado manualmente:** salvar, voltar à biblioteca e abrir o mesmo clipe não pode esticar o vídeo nem gerar rolagem gigante na janela. Preservar proporção, limite da área disponível, controles de reprodução, análise/transcrição e retorno à biblioteca. Aceite: clipes salvos verticais e horizontais cabem no modal em janelas menores e maiores, sem distorção ou vazamento da rolagem para a página. Rastreabilidade: JRN-007/008/009, BR-EDITOR-01/04/06; integração M4/M5 do EDITOR-BASIC-IMPLEMENTATION-PLAN.
2. **Miniaturas persistentes de Meus projetos:** os cartões de projetos com mídia disponível devem carregar uma imagem identificável, reaproveitando cache e preservando o funcionamento leve da biblioteca. Investigar a origem de cartões pretos/sem imagem antes de alterar contratos; projeto vazio ou mídia ausente mantém estado explícito. Aceite: importar/reabrir/retornar a Meus projetos mostra miniaturas correspondentes e não inicia todos os vídeos para obter a imagem. Rastreabilidade: JRN-003/004, FR-003/005, BR-EDITOR-05; integração M0/M4/M5 do mesmo plano.

3. **Estudo do canvas/editor CapCut via REA:** pesquisa local/documental e Ghidra autorizados pelo mantenedor em paralelo, sem substituir as correções da fila. O estudo focal inicial de seis funções foi ampliado expressamente para **M6 do EDITOR-BASIC-IMPLEMENTATION-PLAN**, em andamento: inventário de toda a tela de edição, rastreamento dirigido de importação/cache/proxy/seek/composição e comparação com o caminho real do nosso app. Separar aparecer na biblioteca de copiar/probar/preparar/transcrever; importação instantânea relatada ainda não é benchmark controlado. Provider REA diagnosticado com Node 26: Ghidra 12.2 não pertence à lane suportada 12.1.x; API direta 12.2 continua uma alternativa identificada. Referência de prévia TikTok/Shorts/Reels permanece proposta, sem UI nova implementada por este estudo. Artefatos/tooling isolados e ignorados; registro em OPEN-SOURCE-ENGINE-RESEARCH. Distinguir recursos/strings, caminhos decompilados, hipóteses e runtime medido; lacunas não desaparecem por ampliação do escopo.

Fatia posterior ao commit/push e confirmação Graphify: (4) controles compactos da aba Enquadramento implementados, sem novos controles no canvas, com campos precisos/ícones/tooltips e proteção do rascunho ao trocar item/cena; aguardam teste e aprovação do mantenedor; (5) Node global atualizado para 26.12.1/npm 11.20.0, CI alinhado por `.node-version`, 708 testes/build/lint e 103 scripts sintaticamente verificados. FFmpeg já 9.0.2; labs antigos com paths aposentados não foram executados nos dados normais. A atualização não migrou stack nem alterou dependências indiscriminadamente. Detalhes/limites no TOOLING e ENGINE-HANDOFF.

Retorno humano posterior sobre(4): versão compacta reprovada por estado ativo invertido, seletor de fundo fora do padrão e dependência de digitação. Correção contida em andamento: ativo branco/preto, Fundo compartilhando círculo+hex de Legendas e passos visíveis para posição/zoom. Novo pedido explícito autoriza a caixa/alças da mídia selecionada na prévia para mover/redimensionar e corrige pan invertido; não autoriza painéis ou botões soltos sobre o vídeo. Também foi acrescentada à fila a revisão dos modais: Criar clipe com horários legíveis/textos úteis e hierarquia de ação principal versus secundária em todos os diálogos, preservando seus efeitos. Não marcar esses itens como aprovados pelos testes técnicos.

Estado posterior dessa revisão: retorno humano do cabeçalho encontrou desdobramento de áudio/CC ao ocultar e ausência de mute no vídeo. Corrigidos o vínculo de apresentação e o mute real de áudio pareado em preview/render, sem reescrever settings individuais; carregamento do editor ganhou estado central/retorno e fronteira de erro. Integração836 TS/339 Rust, lint/builds aprovados. Nova avaliação manual solicitada após congelar fontes do app; recarregamento original sem causa demonstrada, com watcher dev como hipótese sustentada apenas em sequência posterior. Investigação player/seek/cache/apresentação continua junto com timeline no M6; não promover a aprovação visual por esses testes.

Lacuna adicional de mídia para a fila após a fatia ativa: `local_media_scheme.rs` recusa GET semRange acima de4MiB para todos os tipos. O mesmo ramo atende imagens; uma imagem maior solicitada semRange recebe400 pela fonte atual. O limite evita alocação integral de vídeo grande, portanto não deve ser simplesmente removido ou ampliado globalmente. Definir caminho/derivado de prévia de imagem ou entrega apropriada e provar memória/qualidade/compatibilidade; render final continua no original. Achado de código, sem benchmark ou cenário WebView real executado nesta leitura. Relacionado ao gate de compatibilidade semRange já aberto. Proposta somente leitura consolidada na rodada17: derivado PNG limitado por pixels/bytes, cache por identidade e SourceGuard; orientação/alpha/16bit/concorrência exigem contrato e fixtures antes da implementação. Não foi aumentado o buffer global.

Complemento17 da biblioteca/criação: ícones com tooltip, tag Editado alinhada à nota, título de até duas linhas e recolhimento individual por projeto implementados. Ir para clipes após criação respeita rascunho/decisão de saída. Contrato nativo de criação e roundtrip combinado validados;958TS/345Rust antes da última adição de recolhimento, seus3casos posteriores e build final aprovados, aparência ainda humana. Pesquisa M6 consolidada após aviso de limite de IA; três processos próprios encerrados, descobertas preservadas e lacunas explícitas. Botões+ nas extremidades foram implementados na fatia18, com intenção cursor/início/fim por operação e reteste humano pendente. Próxima fila do plano permanece imagem grande, jornada normal/797MB e recursos; não reiniciar pesquisa ampla por inércia.

Diagnóstico somente leitura de player no M6: prontidão de fontes (`readyState>=3&&!seeking`) não confirma play resolvido ou frame apresentado; seek público não tem recibo correlacionado por alvo e scrub nulo/falho/superado não é distinguido externamente. O descarte de respostas antigas e a coalescência por rAF já existem. Próxima adaptação deve preservar esses mecanismos e testar sinais separados antes de alterar relógio/buffering. Não tratar isso como prova de travamento real ou justificativa para substituir todo o player.

Correção incremental de preparação implementada em revisão: liberação por mídia em `useCompositionMedia`, eliminando a espera por `Promise.all` de fontes não relacionadas antes de publicar a URL já pronta. Sem mudar clock/armazenamento; identidades substituídas, reconexão, remoção, desmontagem e respostas antigas cobertas por promessas controladas/consumidores simulados. Contrato/aceites no plano M6. Não promete importação instantânea nem resolve por si só o custo de miniaturas/decode.

Retorno humano posterior: testes dos controles e abertura da rodada estável funcionaram no percurso executado. Novas correções ativas: não acumular camadas auxiliares vazias após Ctrl+D/exclusão e manter cursor/alça/régua visíveis ao navegar por muitas camadas. Matriz de50 duplicações, exclusão parcial/múltipla, Undo/Redo, persistência e rolagem vertical/horizontal no plano. Essa confirmação funcional não aprova esteticamente o editor inteiro nem encerra os gates de recursos.

Complemento da mesma fila: aparar não pode levar o cursor junto à borda; Espaço precisa funcionar com foco na timeline após selecionar/aparar, sem virar click/seleção do controle. Causas observadas: gesto envia o frame da borda ao seek, e o item consome Space antes do handler dos comandos enquanto alças são barradas por filtro de button. Correções separadas em investigação/testes, com limites de texto/menu/modal/Fonte e caso de duração encurtada explicitados no plano.

Retorno seguinte: o corpo do item ainda mandava seu início ao seek ao mover. Correção ampliada para todo o ciclo do arraste, inclusive mudança de camada, erro/cancelamento e pausa inicial; cursor editorial independente do objeto. Comandos ficam suspensos enquanto houver montagem provisória; Espaço preserva seleção e volta após soltar/cancelar, com Escape preservado e foco recuperado somente após remontagem. Integração:907/908 inicialmente; falha de IME corrigida sem cast e50/50 afetados PASS, lint e build final sem avisos. Não foi uma nova execução integral908/908. Fontes congeladas e pergunta de teste manual enviada; retorno desta fatia pendente. Detalhes no Complemento14.

Retorno humano da rodada14: demais testes funcionaram, mas trim com ímã apagava conteúdo de camadas superiores. Correção de domínio no Complemento16 removeu recorte/inserção global do trim, preservando grupos independentes e deslocando só os blocos posteriores da principal com seus vínculos. Matriz de ambas as alças/deltas/ímã, locks, quatro tipos de camadas, histórico e duração integrada:922/922 TS, lint e build sem avisos. Bloco posterior fixo bloqueia ripple de forma conservadora, com orientação de desligar o ímã; não foi apagado nem deslocado silenciosamente. Mantenedor confirmou no reteste: “As camadas foram preservadas”. Isso valida o percurso testado, sem aprovar todo o editor ou exportação. Exclusão explícita de intervalo permanece outro comando; nenhum dado real foi usado como fixture ou alterado.

Pedido adicional executado após alças/Espaço: removido somente o divisor inferior do cabeçalho de edição apontado pelo mantenedor, mantendo a separação de navegação superior e o layout/ações existentes. Incluído no build validado do Complemento14; aprovação visual ainda é do mantenedor. Sem refazer cabeçalho ou adicionar botão nesta correção.

**Configurações do projeto — ESTUDO/PROPOSTA futura, não implementada:** estudar as abas Detalhes/Desempenho do CapCut e, quando houver contratos reais, propor ícone de menu após Exportar abrindo um modal no design system do CutNicePro. Referências enviadas mostram nome/localização do projeto, mídia copiada ou no original, espaço de cores, ponto flutuante, organização de camadas, proporção/resolução/FPS e Proxy. Presença na referência não significa capacidade implementada aqui: só exibir controles que tenham comportamento validado. Proxy exige esclarecer configuração→job/arquivo derivado→seleção na prévia→invalidação/limpeza→uso do original na exportação, com progresso/cancelamento/orçamento de recursos. Provider/mapa/cache de metadados observados no estudo não comprovam esse fluxo completo. Pesquisa M6 continua; modal/recursos novos dependem da proposta e dos aceites pertinentes, sem interromper as correções do editor.

6. **Originais por referência — M7A IMPLEMENTADO EM REVISÃO:** novos imports sem cópia integral, com SHA integral verdadeiro; índicev2 e mídias gerenciadas antigas preservados, resolvedor comum, arquivo alterado indisponível, religação do mesmo conteúdo e proteção contra excluir/sobrescrever originais. UI contextual mantém rascunho e IDs, diferencia erros e respeita sucesso já confirmado no cancelamento tardio.334 Rust/743 TS, lint e builds completos passaram; FFmpeg real preservou os originais em fixture própria, ASR teve extração de áudio sem inferência. Build padrão atualizada para teste manual. Não houve migração/apagamento das cópias existentes; latência real, jornada normal, ASR completo e aceite humano permanecem pendentes. Hash ainda lê o arquivo completo; não confundir referência com importação instantânea ou solução já medida para o lag de timeline. Estado e hash da build no ENGINE-HANDOFF Complemento09.

## Metas de usabilidade solicitadas — 2026-10-25

Estado vigente: IMPLEMENTADAS EM REVISÃO, com correções após os testes do mantenedor; aprovação manual/visual pendente. Envio compacto centralizado; trim sobre a faixa real, ampliação até a fonte, histórico e persistência; split por cena com par confirmado e quadro único nos closes. Evidências e limites em ENGINE-HANDOFF e USABILITY-IMPLEMENTATION-PLAN. A melhoria editorial do modelo continua pausada. As três metas abaixo descrevem o escopo autorizado, sem declarar aceite humano.

1. **`goal-envio-local-usavel` — envio de arquivo claro e previsível.** Referência de composição: barra compacta do SupoClip, com identidade visual do CutNicePro. Selecionar/arrastar arquivo, revisar opções suportadas e iniciar explicitamente o fluxo; apresentar arquivo selecionado, progresso, cancelamento, erro recuperável e destino do projeto. Não criar projetos vazios por confirmação prematura nem oferecer download de URL nesta meta. Reutilizar importação persistente existente. Aceite: arquivo local → preparação/projeto acessível → reabrir com mídia preservada; preferências realmente aplicadas. Rastreabilidade: JRN-004, FR-005, BR-006..011, US-007/008, AC-016..022; transcrição/geração posteriores continuam pelos serviços existentes.
2. **`goal-timeline-arrastar` — edição manual compreensível.** Arrastar bordas para ajustar início/fim; distinguir esse gesto do movimento do cursor. Exibir segmentos selecionáveis e suas remoções, desfazer/refazer e controles com nomes claros; campos de tempo ficam como ajuste preciso secundário. Preservar desempenho do seek e plano existente. Aceite: aparar/remover → prévia correspondente → salvar/reabrir → exportar os mesmos intervalos; original intacto. Sem prometer reordenação livre de segmentos no EditPlan v1 cronológico. Rastreabilidade: JRN-009, FR-011/013, BR-020/022, US-019/020, AC-050..054.
3. **`goal-split-screen-local` — duas pessoas empilhadas em 9:16.** Estudar o caminho facial/composição do SupoClip, implementar na base própria e integrar detecção já existente. Dois recortes independentes, ajuste manual por painel e persistência; quando a detecção não sustentar duas pessoas, permitir escolha manual ou enquadramento seguro com explicação. Aceite: duas pessoas visíveis, mesma geometria na prévia/MP4 e após reabrir; legendas/áudio/trim corretos; um rosto, nenhum rosto e mudança de cena tratados. Primeiro escopo é duas pessoas, sem inferir que já inclui participante+tela compartilhada, alternância automática por falante ou grade de quatro. Rastreabilidade inicial: JRN-009/010, FR-013/014, US-020/021, AC-053..055; detalhar regra/aceite adicional do novo layout antes da implementação.

Cada meta exige análise Graphify atual e complemento local, revisão funcional proporcional, build única e validação manual curta na sessão normal. Mudanças de UI/layout não devem alterar prompts, transcrição ou seleção textual; contratos novos de composição devem manter leitura dos ajustes antigos. Projetos/clipes existentes não são recriados para servir de demonstração.

## Adaptação AutoClip — prompts e rostos — 2026-10-24

Decisão vigente, 2026-10-25: mantenedor autorizou versões sobrepostas/contidas e teto de 16 por geração. Implementação permite essas versões no ranking/dedupe/reparo e no refinamento independente de bordas/cenas; campo personalizado e contrato Rust sincronizados, inclusive lote facial de 16. Permanecem qualidade própria de cada versão, prioridade secundária da publicidade, biblioteca cumulativa e dados antigos. As restrições históricas de 12/intervalos disjuntos citadas abaixo descrevem o baseline anterior, revogado por esta decisão. Não confundir o teto 16 com promessa de quantidade; resultado real e limites editoriais no handoff.

Checkpoint 2026-10-25: Preencher na prévia/download foi aprovado manualmente pelo mantenedor nos quatro cortes preservados. Qualidade narrativa segue tecnicamente PARTIAL: controles livres Qwen 4B/9B e Ministral demonstram erros antes dos filtros. Ministral baixado/testado por pedido explícito, sem integração/default novo. Cobertura regional 4→5 não trouxe assunto novo e foi retirada do caminho normal. Corrigido descarte de citação longa literal única; isso não garante descoberta de histórias. Oito propostas do Ministral com prompt do app têm seis pares de citações únicos, mas ainda deixam o T-PAP incompleto. Próximo aceite continua assuntos distintos completos e título fiel, sem CTA inventado; variantes sobrepostas do Opus devem ser tratadas separadamente da cobertura de assuntos. Evidência: `reports/evidence/editorial-stories-2026-10-25.json`; continuidade canônica no ENGINE-HANDOFF.

Comparação objetiva de 14 MP4s Opus em 2026-10-25, FR-010/014, BR-019/020/023 e AC-041: há histórias completas e variantes sobrepostas, gancho antecipado comprovado e composição variável por cena. O teto local 12 e a seleção sem sobreposição diferem dessa experiência, mas não explicam sozinhos só quatro sugestões. Prioridade continua recuperar os assuntos distintos com contexto/conclusão e redação fiel; depois avaliar variantes úteis e montagem ordenada em um contrato próprio. Não retirar validações do EditPlan v1, gerar quantidade artificial ou ligar multimodal pesado por presunção. Estudo e inventário na referência open source e em `reports/evidence/opus-comparison-2026-10-25.json`.

Preencher no reparo editorial: perda de `fit` reproduzida e corrigida, com cover/contain preservados nos novos cortes reparados. Teste RED→GREEN e suíte nativa 201/0/25 opt-in; build única recompilada. Coleções/edições antigas não foram regravadas. Verificação manual da nova geração continua pendente; auditoria não encerra a falha editorial do T-PAP.

Feedback manual de 2026-10-25 reabriu preenchimento, redação e fechamento: Preencher não pode ser convertido para contain por ambiguidade facial; a legenda da inspeção precisa parar no intervalo; anúncio de continuação não é desfecho mesmo com ponto. Avaliação e reparo passam a receber fonte integral como contexto, com evidências/publicação restritas ao intervalo real. Uma busca automática adicional procura outras histórias sem usar a biblioteca como veto. Localização usa correspondência exata primeiro e alinhamento lexical conservador somente para citações de 8+ palavras, até dois tokens/20%, extremos literais e resultado único; nada é reescrito na mídia e os candidatos continuam sendo avaliados. Reparo usa as mesmas citações localizadas, em vez de índices numéricos escolhidos pelo modelo. Estado e resultados reais no registro de 2026-10-25 do ENGINE-HANDOFF; títulos/resumos ainda exigem avaliação por conteúdo, sem concluir pelo score nem pela contagem.

A recusa tipada por contexto ausente/final incompleto agora precisa concordar com nota e justificativa entregues ao reparo; antes o mesmo resultado recusava o corte e afirmava fechamento ótimo. Teste reproduziu a contradição. Calibração por etapa mantém a avaliação em 0,7 e usa 0,4 na extração de citações, após comparação nas duas transcrições integrais; não é treinamento nem aprovação da redação. Detalhes controlados na referência open source e no handoff.

Checkpoint final 2026-10-25: GLM-5.3-Flash do Coding Plan foi testado a pedido do mantenedor, sem virar provedor do app. Também aprovou o mesmo intervalo de 48 s do Qwen e colocou no resumo fatos que só são ditos depois. Instruir o modelo a limitar a publicação às falas incluídas não comprova essa limitação: fidelidade editorial permanece aberta. Revisão narrativa de lote/individual e controle regional não resolveram; protótipos somente em cfg(test), fora do caminho normal. Não transformar 11 propostas do GLM ou 4–5 MP4s locais em aceite. Próxima fatia deve resolver essa distinção de escopo, preservar as referências humanas e manter testes que expõem o defeito.

Pedido mais recente, BR-019/020 e AC-041: permitir gerar novamente o mesmo conteúdo com ID/data próprios, preservando versões/revisões/edições anteriores; dedupe só dentro do job atual. Implementado com regressão determinística e ensaio nativo: duas gerações no Davy inteiro publicaram 2 + 2, com intervalos repetidos, IDs/datas distintos e JSON anterior preservado após marcar rejeitado/excluído e alterar o título. Exportação e salvar/reabrir exercitados no perfil exclusivo do laboratório; nenhum dado inserido na biblioteca real. Localização por citações no automático e comparação dos pipelines/tokens em E2–E5 do ENGINE-HANDOFF. A referência editorial de seis episódios continua parâmetro, não atingida por essa rodada: localização/recall e títulos ainda precisam ser julgados pelo conteúdo. Os parágrafos abaixo registram a evolução anterior; não reintroduzir o bloqueio de repetições da biblioteca.

Resultado adicional da mesma fatia: UX integral, 568 segmentos/24,6 min, gerou e exportou 8 cortes em 492,44 s. Pendências reais: recuperar todos os momentos da referência Davy, evitar atribuições sem suporte em títulos (ex.: “cliente” no corte sobre quantidade de cases) e testar o fluxo manual na instância normal. Clippy estrito global: 19 diagnósticos em código preexistente, sem supressão; requer fatia própria de manutenção/impacto. Compilação normal e testes desta entrega passaram; esse registro não transforma a qualidade editorial em PASS.

Decisão posterior e vigente: Qwen3.5-4B exclusivo, contexto 32K, Gemma 4 retirado, sem novos testes do Qwen3 antigo. Referência editorial aprovada pelo mantenedor: seis propostas do assistente na transcrição completa, incluindo dois casos dependentes de imagem; artefato criterio-editorial-assistente-2026-10-24.json em reports/evidence. Não fixar seus tempos/títulos no produto nem impor seis cortes a todo vídeo. O Qwen ainda precisa alcançar essa qualidade; comparação com a referência exige abertura, desenvolvimento, fechamento, fidelidade de título e preservação da imagem comentada. Comparações externas/seletor abaixo são histórico de autorização e ficam adiados pela direção nova.

Refino incremental autorizado nesta data (FR-010, BR-019/020/023, AC-041): gerar deve acrescentar sugestões e preservar as versões salvas, revisões e exclusões. Duplicatas são retiradas antes de ocupar vagas. Uma exclusão não bloqueia todos os outros momentos da mesma região. A busca adicional ocorre depois dos filtros finais, uma única vez. Avaliação e análise publicada do mesmo intervalo passam a compartilhar o mesmo resultado fundamentado; qualquer alteração de borda exige avaliação própria. O piso 50 e as recusas por contexto/conclusão permanecem. Diagnóstico, testes reais malsucedidos e resultado final ficam no registro canônico do ENGINE-HANDOFF; não concluir eficácia editorial por testes de contrato.

Complemento implementado: reparos ocupam apenas vagas livres sem deslocar cortes já aceitos nem criar sobreposição, respeitando três tentativas por job. A descoberta adicional recebe as falhas concretas e também pode ocorrer em coleção inicialmente vazia. Avaliador interno usa categorias tipadas de abertura/fechamento, traduzidas para os contratos públicos existentes; notas altas não anulam contexto ausente ou ideia incompleta. A comparação 9B foi autorizada posteriormente, mas os resultados instruct/thinking não justificaram trocar o default. Qualidade equivalente às seis referências continua pendente; não é uma pendência exclusiva de aprovação humana. Última geração isolada sem cortes; avaliador mantido em 5/6 positivos e 3/3 controles. Tentativa posterior pior rejeitada, sem reduzir critérios.

Próxima fatia autorizada pelo mantenedor, após estabilizar esta geração: seletor de modelo no diálogo Gerar cortes para comparação manual. A autorização inicial de amostras Z.ai foi ampliada para Groq/GPT-OSS-120B e Google/Gemini com a transcrição inteira, sem dividir o texto; Gemini 3.8 autorizado após indisponibilidade do 2.5. Resultados/erros no ENGINE-HANDOFF; resposta de API não equivale a corte aprovado. Nenhum vídeo foi enviado, nenhum fallback externo foi integrado e nenhuma chave é incorporada ao código. Integração no app depende de sinalização do envio, credencial protegida, procedência por clipe e tratamento de indisponibilidade; processamento local continua principal.

Inventário 2026-10-24: Qwen3-4B e Instruct-2507 instalados; Qwen3.5-4B não encontrado. Comparar Instruct com pipeline corrigido e template próprio antes de trocar Gemma. Medir títulos específicos, contexto/conclusão e recursos; maior quantidade/nota do próprio modelo não comprova qualidade. Nenhum download ou troca de padrão nesta consulta.

Escopo autorizado pelo mantenedor: estudar os módulos pertinentes e aplicar melhorias no caminho local. Biblioteca leve e organização testadas e aprovadas funcionalmente pelo mantenedor; não reabrir esse redesenho. Graphify em 8a635b5 confirmado nesta tarefa.

Plano incremental: (1) seleção orientada a pergunta/resposta ou argumento completo, com avaliação explícita de autonomia e conclusão; título fiel ao conteúdo realmente incluído; (2) corrigir refino que recua a conclusão e remover alocação permanente de operações; (3) detectar rostos por YuNet local e estimar fala por movimento da boca, aplicando centro estável ao corte sem sobrepor edição manual. Quando as posições forem incompatíveis com um recorte estático seguro, preservar o quadro amplo. Não anunciar acompanhamento por tempo, diarização ou reconhecimento de identidade: esta fatia identifica posição de rostos e um centro seguro, não implementa câmera animada.

Contratos: booleans de autonomia/conclusão são obrigatórios nas respostas novas do avaliador, sem alterar coleções históricas. Novo metadado opcional faceFraming valida valores em Rust/TS; não será rotulado como evidência multimodal do LLM. Somente cortes novos recebem o trabalho; sem reanálise de biblioteca. Nenhuma mídia é enviada para nuvem.

Aceites antes da implementação: candidato incompleto/contextual não ganha vaga por nota alta; refino não retira a frase conclusiva; títulos não prometem lista ou contraste ausente; teste real do YuNet com mídia local e consumo delimitado; no máximo um worker de rostos, uma thread, amostragem limitada, cancelamento/timeout e fallback isolado; paridade do centro estático entre prévia/editor/export; edições salvas vencem; teste manual do resultado editorial pelo mantenedor. Python/OpenCV ficam isolados em .tooling, com versões fixadas e sem instalar nada automaticamente durante geração.

Estado de entrega: contratos/prompts/gates, correções de bordas e YuNet implementados. Regressões automatizadas/nativas PASS; ensaios intermediários de IA não produziram amostra editorial aprovada (detalhes no ENGINE-HANDOFF), e não houve terceira inferência depois das últimas correções. Teste manual da geração final permanece pendente, sem declarar qualidade comprovada por testes de contrato. Câmera animada e instalador do runtime para release fora desta fatia.

## Resultado visível da geração — 2026-10-24

Correção de FR-010/AC-041 e estados de erro/resultado existentes: quando a seleção/análise não aprova cortes novos, informar explicitamente em toast persistente que os cortes anteriores foram mantidos. Falha de validação do retorno não pode virar sucesso pela conclusão do processo nativo, nem desaparecer por evento tardio. Implementado e verificado em React com IPC simulado (cinco cenários); teste manual do mantenedor pendente. Não altera os critérios de qualidade nem constitui melhora editorial comprovada.

## Correção da biblioteca — implementação 2026-10-24

Vínculos: JRN-002/008, US-003/014/015, FR-004/010, BR-019/020, AC-006/041/044/045 e responsividade NFR-002. Escopo autorizado: galeria leve, separação vertical por projeto e Novo durante uma hora. Sem alteração da seleção editorial, notas, revisão, mídia original ou edições.

- Implementado: JPEGs locais em cache de até 640 px, produzidos em série, sem players por card; cache em memória limitado a 64 miniaturas e compartilhamento de solicitações; workspace lido uma vez por projeto na galeria.
- Implementado: seções por projeto com nome/contagem, ordenação Por projeto como padrão global, Mais recentes adicional e filtros/ações existentes preservados. Ordenar clipes mantém as seções.
- Implementado: Novo expira ao completar 60 minutos da criação persistida, independente de abertura; relógio atualiza com a tela ociosa; nenhum timestamp fabricado para legados. Para futuras gerações, criação marcada após seleção/análise, sem consumir a hora durante a inferência.
- Aceite automatizado: 27 cards sem video no DOM; fila com no máximo uma leitura ativa; cache reutilizado no retorno; erro de miniatura isolado; grupos por ID/projeto; Novo em 59:59/60:00, após abertura e durante ociosidade. Compatibilidade de editor, download, persistência e demais testes executados permanece documentada no handoff.
- Aceite manual PENDENTE, a cargo do mantenedor: reiniciar a build padrão se necessário, percorrer a biblioteca para baixo/cima duas vezes, conferir seções e abrir/fechar um corte recente sem perder Novo. Não é necessário esperar uma hora: o limite é verificado com relógio controlado nos testes.

## Prioridade vigente — revisão documental 03N, 2026-10-19

Esta etapa atualiza documentação; não corrige o código, retira pesos nem muda a UI. As decisões abaixo foram solicitadas pelo mantenedor após testar a 03M e têm implementação pendente.

| Vínculo | Constatação no código/relato | Próximo aceite de implementação |
|---|---|---|
| EPIC-006, US-014/015, AC-041/042, FR-010, BR-023 | Resumo/critérios de Qwen são exibidos por ClipDetails; o mantenedor rejeitou linguagem de avaliação técnica da fala | Descrição natural e específica dos acontecimentos/contexto/reação/desfecho, sem texto genérico ou fatos inventados; nota explicada pelo conteúdo, sem tendência fictícia |
| EPIC-008/009, US-020/023, AC-053/054/057, FR-013/014 | 9:16 é formato inicial, mas isolatedClipSettings usa contain; formato correto ainda pode ter grandes faixas | Quadro vertical preenchido para publicação, sujeito/legenda preservados e coerência entre miniatura, inspeção, editor e render; prévia do original intacta |
| EPIC-011, FR-022, DEC-014 | Turbo é padrão; Large completo ainda existe em profiles.rs e TranscriptionSetup | Manter Turbo; remover opção/caminho Large do produto com compatibilidade para registros antigos; não apagar arquivos do usuário ou histórico de testes |
| Engenharia transversal, NFR-004/006 | A pesquisa de referência não comprova estudo integral dos módulos nem adoção de código | Estudar os fluxos pertinentes dos repositórios indicados e registrar revisão, arquivos/funções, contratos, licença, adaptação e testes antes de implementar |

247 testes da 03M são evidência histórica de contratos/processamento, não aceite de qualidade ou dos defeitos acima. Referência de continuidade: docs/engineering/ENGINE-HANDOFF.md; inventário: docs/references/OPEN-SOURCE-ENGINE-RESEARCH.md. Sem nova tela, integração remota ou aprovação visual nesta revisão.

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
  (BR-033, NFR-003). JSON nativo para projetos/mídia/transcrição/clipes e localStorage para ajustes já implementados; recuperação integral/autosalvamento de todas as decisões ainda pendentes.
- **US-006 — Duplicar/excluir projeto** (Should, V1 — FR-017) — AC: AC-014 duplicação
  independente (BR-003); AC-015 exclusão com confirmação e preservando exports (BR-005).
  Atualização 03H: mantenedor antecipou exclusão em 2026-10-19. Código e testes de confirmação/limpeza compartilhada/recuperação implementados; aceite Tauri/visual pendente de sua conferência. Duplicação permanece pendente. EDITOR-USABILITY-SPEC.md.

## EPIC-003 — Importação de mídia

Estado atual: arquivo local é copiado para armazenamento gerenciado, identificado por hash e analisado por ffprobe; há reabertura persistente e tratamento de mídia ausente. Referências: M2A-IMPORT-SPEC e ENGINE-HANDOFF. Lote e download de links continuam pendentes. Histórico 03C/03D: entregou apenas interface e preparação demonstrativa, sem concluir então US-007/008/012/013; limitações daquela fatia não descrevem os motores adicionados depois. Projetos vazios legados e coleções são preservados.
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
Estado atual: ASR Whisper local/DTW, edição e TXT/SRT; blocos com checkpoints e retomada ASR, CPU/CUDA por descoberta. Render MP4 com legenda existe no EPIC-009. Sem fila persistente geral ou avaliação de precisão aprovada. M3A-TRANSCRIPTION-SPEC registra a primeira fatia e sua evolução; CPU/Base e ausência de exportação eram limitações históricas, não o estado vigente. Retirada do Large completo em favor do Turbo está decidida, ainda pendente no código.

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

Extensão aprovada em 2026-10-27: BR-EDITOR-09/AC-EDITOR-09 acrescentam marcadores, nome/cor de faixa e organização da timeline à mesma JRN-009. Código implementado/testado, estado IN REVIEW sem concluir o épico; correção de foco após excluir marcador passou a regressão automatizada e aguarda reteste humano. Contrato e critérios no BUSINESS-RULES/TRACEABILITY e na fatia correspondente do EDITOR-BASIC-IMPLEMENTATION-PLAN.

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

### Atualização 2026-10-19 — 03M: confiabilidade do pipeline em revisão

Correção autorizada do fluxo existente: consulta não gera/analisa automaticamente; revisão persiste antes de fechar, com filtro ativo e consulta a rejeitados. Seleção semântica deixa de receber só candidatos pré-filtrados por heurística; todo texto é lido em janelas. Checkpoints de transcrição e sondagem de GPU/encoder implementados e exercitados localmente. EPIC-006/008/009 continuam IN REVIEW. Não concluir qualidade editorial, visão multimodal, precisão ASR ou distribuição dos runtimes por existirem testes aprovados. AC-03M-01..08 e evidências no SPEC/REVIEW de confiabilidade; funcionalidades multimodais/API comercial não acrescentadas ao escopo desta entrega.

## Execução aprovada — editor básico completo (2026-10-26)

Prioridade atual do mantenedor; EPIC-008 e jornadas 003/004/007–010. Plano vinculante: docs/engineering/EDITOR-BASIC-IMPLEMENTATION-PLAN.md. M0 regressão de leitura/seek; M1 domínio/salvamento/recuperação; M2 timeline e comandos; M3 mídias/camadas/áudio/legendas/render; M4 jornada/biblioteca; M5 aceite integrado. Estado IN PROGRESS, não concluído. Regras BR-EDITOR-01..06 e AC-EDITOR-01..06. Preservar trabalhos de IA/editorial e demais pendências; nenhuma tarefa anterior é encerrada por esta inclusão.

Feedback de 2026-10-26: reprodução/modularidade corrigidas em código e verificações controladas; refinamento subsequente acrescenta ímã, drag entre camadas, trim inicial correto e duplicação/colagem sobreposta, com zoom compacto. Suíte integrada atual: TS 644/644 e Rust 289/289 executados + 33 opt-in ignorados; builds padrão/lint limpos. Estado continua IN PROGRESS: testar a jornada normal e o vídeo de 797 MB, medir p95/RSS/VRAM e obter aceite humano. Testes não encerram esses gates.

Continuação autorizada: CC e Q/W confirmados manualmente; intervalo R, acompanhantes de overlay, divisor e faixa de zoom refinados depois. TS 688/688, lint e build limpos, sem novo código Rust. Auditorias de duplicação, recursos/fechamento e desempenho só iniciam após commit/push e confirmação de índice Graphify atual, conforme ENGINE-HANDOFF Complemento 06. Meta do editor e pendências de desempenho real continuam abertas.
