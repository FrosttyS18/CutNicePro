# Envio, timeline e split screen — Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development or superpowers:executing-plans, task by task. O mantenedor autorizou executar em 2026-10-25 com /start; commits e pushes não estão autorizados.

**Goal:** acrescentar ao plano da meta existente três entregas utilizáveis: envio local compacto, trim por arrastar e duas pessoas empilhadas em 9:16. A calibração editorial continua suspensa.

**Architecture:** preservar React/TypeScript/Vite, Tauri/Rust, armazenamento e serviços locais. Interface envia opções tipadas; edição manual produz o EditPlan existente; composição usa o mesmo contrato de dois painéis na prévia e no FFmpeg. Novos campos são opcionais e ajustes antigos continuam válidos.

**Tech Stack:** bibliotecas já instaladas, CSS/tokens do produto, Phosphor, Canvas2D, FFmpeg e detector YuNet existente; sem serviço externo, novo modelo ou dependência por conveniência.

**Spec:** pedido do mantenedor, referências visuais SupoClip, BACKLOG §Metas de usabilidade e estudo em OPEN-SOURCE-ENGINE-RESEARCH. Rastreabilidade: JRN-004/009/010, FR-005/011/013/014; AC existentes citados no backlog. Split exige aceite específico abaixo, sem fabricar aprovação visual.

## Global Constraints

- Não alterar prompts, pesos, seleção de histórias ou transcrição nesta implementação.
- Preservar projetos, clipes, mídia original, biblioteca e edições anteriores.
- Uma branch no checkout existente; somente app/src-tauri/target para builds. Nenhum novo worktree/cache de compilação.
- Não copiar código AGPL do SupoClip; implementar os contratos na base própria a partir do estudo de funcionamento.
- Identidade/tokens escuros existentes; referências orientam organização, sem transplante de marca.
- Sem YouTube, grade de quatro, B-roll ou reordenação livre nesta entrega.
- Sem controle do PC para testes rotineiros. Consulta Opus autorizada somente como referência, sem alterações/salvar/exportar/recursos pagos.
- Testes RED→GREEN pertinentes, uma validação integrada final; visual permanece PENDING HUMAN APPROVAL.
- Graphify consultado em df1186b, mesmo HEAD; mudanças locais posteriores exigem complemento de fonte/diff.

## Review Focus

- Importação cancelada ou falha não pode virar sucesso ou abrir projeto sem vídeo; listeners e job pertencem à chamada correta.
- Drag de alça não pode virar seek do contêiner, cruzar limites/vizinhos ou gerar centenas de ações no undo.
- EditPlan continua cronológico, não sobreposto, em segundos da fonte; prévia e export mantêm a mesma duração.
- Split não pode criar segundo decodificador de vídeo ou loop de desenho quando pausado; scrub e áudio existentes são preservados.
- Layout salvo/IPC antigo/um rosto/nenhum rosto/duas pessoas/cena diferente devem ter resultado explícito, seguro e sem falsa detecção.

## Task 1 — Envio local utilizável

**Files:** UploadScreen.tsx, componentes em components/upload, upload.css, App.tsx, lib/ipc.ts, UploadOptions em workspace-types.ts, inicialização em workspace.ts, testes de fluxo. Mudança nativa de job opcional somente se necessária para identificar/cancelar a importação própria.

**Interfaces:** manter onFilePath(path,name,options,onProgress), estendendo progresso/cancelamento de forma retrocompatível; UploadOptions aceita fit opcional. Opções adicionais de split são integradas após Task3, sem botões falsos antes disso.

- [ ] Testar seleção sem criar projeto, opções escolhidas, início explícito, erro/retry e cancelamento.
- [ ] Implementar compositor compacto com seletor de arquivo/drag, nome, objetivo, formato, preenchimento e estilo de legenda; ação principal Importar vídeo.
- [ ] Conectar serviço nativo existente e cancelamento real; preservar seleção no erro, impedir envio duplicado e manter projetos recentes.
- [ ] Testar persistência das opções e tratamento transacional de projeto novo em falha/cancelamento; não apagar dados preexistentes.
- [ ] Validar tipo/lint/fluxos pertinentes e registrar arquivos/resultados.

## Task 2 — Timeline por arrasto

**Files:** EditorTimeline.tsx, TimelineSurface.tsx, novo componente/hook pequeno de trim, lib/edit-plan.ts se necessário, CSS dedicado e testes de timeline/edit-plan.

**Interfaces:** TimelineSurface mantém onSeek(time); alças usam onTrimCommit(segmentIndex,edge,value), em segundos da fonte. Draft local durante o gesto; commit único em onSettings no final. cancel/lostcapture não salva draft. Campos precisos e teclado permanecem disponíveis.

- [ ] Testar drag de início/fim, limites mínimos e vizinhos, seleção e remoção do segmento correto, cancelamento e teclado.
- [ ] Implementar alças e indicação dos segmentos sem aninhar controles interativos no slider de seek.
- [ ] Preservar o caminho FrameSeeker e coalescência; seek durante gesto é limitado a um request por frame, sem onSettings por pixel.
- [ ] Trocar rótulos ambíguos por Dividir e Excluir trecho selecionado; manter desfazer/refazer via histórico existente.
- [ ] Verificar plano salvo/reaberto e consumidores de exportação; nenhum movimento/reordenação não suportado pelo v1.

## Task 3 — Split screen local

**Files:** novo lib/split-screen.ts e componente de prévia; workspace-types.ts, workspace-store.ts, clips.ts, VideoPreview.tsx, controles do editor, render/settings.rs/pipeline.rs e módulo de geometria; worker facial/adaptador quando necessário; testes TS/Rust/FFmpeg.

**Interfaces:** `SplitPanel={x:number,y:number,zoom:number}` com x/y0..100 e zoom1..3. `SplitScreenSettings={version:1,top:SplitPanel,bottom:SplitPanel}`; EditorSettings/RenderSettings têm `splitScreen` opcional/null. Ausente conserva a composição atual. Split requer 9:16. Efeitos, áudio e legendas continuam globais.

- [ ] Testar geometria das duas regiões, validação inválida, leitura dos ajustes antigos, persistência e payload TS→Rust.
- [ ] Implementar crops próprios com proporção de cada metade, sem deformar a fonte; empilhar em 1080×1920 no render. Prévia aplica a mesma geometria, com uma fonte de vídeo e canvas único.
- [ ] Integrar scrub/pausa/seek e limpar callbacks; original/comparação original continuam sem transformação.
- [ ] Adicionar seleção de layout e ajustes de cada painel, com rótulos claros, restaurar quadro único e undo compatível.
- [ ] Integrar sugestão facial local somente quando sustentar duas pessoas; um rosto/nenhum rosto/mudanças incompatíveis explicam a limitação e preservam ajuste manual/quadro seguro.
- [ ] Expor a opção no envio depois de funcional, sem inventar que detectou duas pessoas.
- [ ] Testar FFmpeg real com fixture pequena de regiões distintas e legendas; comparar conteúdo/crops/duração, não apenas resolução.

## Task 4 — Integração e entrega

- [ ] Revisar diffs e contratos por segunda leitura independente.
- [ ] Rodar TS relacionado, typecheck/lint, Rust relacionado e suites de integração afetadas; não repetir aprovados sem nova alteração pertinente.
- [ ] Compilar somente a build padrão e informar artefato efetivo; fechar normalmente o app próprio se necessário, conforme autorização permanente.
- [ ] Atualizar requisitos/aceites afetados, BACKLOG, handoff e relatório; roteiro manual curto para importação, arrasto e split salvo/exportado.

## Execution ledger

### Estado de espera — 2026-10-25

Meta marcada `blocked` após a entrega e duas continuações com a mesma dependência: resultado do teste manual na sessão normal. O objetivo continua não concluído. O último turno foi auditoria/sem novo progresso funcional; não é verified wait de um job. Nenhuma nova falha ou evidência manual chegou nesta continuação. Não repetir suítes nem criar outra implementação enquanto se aguarda o retorno. Retomada: usar o comportamento observado pelo mantenedor para confirmar o aceite ou reproduzir a próxima falha concreta.

### Auditoria de conclusão — 2026-10-25, após a entrega para teste

Estado atual relido, sem repetir suítes aprovadas ou acrescentar funcionalidades. Turno anterior classificado como progresso: houve correções, novos testes e build. Esta auditoria não declara a meta concluída.

| Requisito original | Evidência inspecionada | Limite do aceite |
|---|---|---|
| Envio centralizado/compacto | UploadScreen/upload.css e render SSR existente | Aparência na janela normal ainda depende do mantenedor |
| Cortar na faixa, sem controles sem função | TimelineSegments/useTimelineTrim/EditorTimeline; geometria com offset0 nas quatro larguras; alças sem sobreposição | Arrasto manual no aplicativo ainda não confirmado |
| Ampliar além da IA, salvar/reabrir/baixar | editor-source-flow e clip-inspection-plan; payload export usa os limites ampliados; testes nativos FFmpeg | Percurso completo na sessão normal ainda não confirmado |
| Duas pessoas diferentes no split | worker real wardigs103,72–183,90s, par103,72–112,95s; testes de composição por cena e export FFmpeg | Preview, salvar/reabrir e MP4 do projeto real precisam do teste manual |

Binário SHA256 `EB1D99F62A9B7FACE1905533DB4000D142079E16A9171DC19CE62D35A6B50F47`, processo35772 no caminho normal. Datas verificadas: binário posterior à fonte nativa/Python alterada; dist posterior à fonte frontend alterada. Resultados lidos:358/358 na completa e30/30 na focal posterior; worker18amostras/26,25s. Isso confirma a disponibilidade técnica, não o aceite visual. Única dependência externa atual: retorno do teste manual, conforme preferência expressa de não controlar interativamente o PC. Nenhum teste de modelo, nova build paralela ou alteração em dados reais.

### Checkpoint atual — correções após os testes manuais, 2026-10-25

- Implementado: compositor compacto centralizado, importação transacional e opções tipadas; nenhuma calibração ou geração de cortes nesta fatia.
- Implementado: alças ancoradas à mídia, draft/commit único, expansão até a fonte, EditPlan/trim sincronizados, histórico e inspeção/download com duração composta. Seek pausado explora a fonte; reprodução remove os vãos. Cabeçalho tem três grupos; alças externas acessíveis em trechos estreitos.
- Contrato: `SplitScreenSettings.shots?: SplitShot[]`, janelas absolutas ordenadas/sem sobreposição, máximo64. Ausente conserva legado; presente aplica o par somente na cena confirmada, quadro único nos closes. Ajustes manuais afetam a cena ativa. Prévia usa o instante do frame apresentado, scrub leva seu instante associado. Export separa janelas, rebaseia ASS e concatena; interseções menores que0,05s retornam erro claro, sem apagar/alongar mídia.
- Detector: viewport normalizado opcional, FFmpeg por cena, YuNet960/confiança0,8, três amostras/cena, prazo60s e guarda nativa75s. Quatro pessoas na fonte com duas na área visível não provocam recusa global; sem par conserva quadro único. Não há reconhecimento de identidade ou rastreamento geral.
- Referências: OpenCut Classic resize-controller/compute-resize/TimelineElement e Twick TrackElementView/VideoElement/histórico, revisões e limites no documento existente. Mantidos motor/contratos próprios.
- Evidências em `.tooling/test-output/`: timeline-layout/results.json (quatro larguras), usability-current-vitest.json, usability-review-fixes.json, split-frame-time-vitest.json, split-real-wardigs/production-scenes-v2-result.json; FFmpeg real em render::split_screen_tests. Componentes simulados não equivalem a interação na sessão normal. Estética/aceite humano pendentes; plano em revisão.

### Correção do fluxo real — meta ativa de 2026-10-25

Relato do mantenedor reabre o aceite das três frentes. Requisitos: envio centralizado na área útil; cortar/selecionar diretamente sobre a faixa de miniaturas, sem linha artificial “Trecho 1” ou botões técnicos permanentes; ampliar cortes até os limites da mídia original, com prévia, salvar/reabrir e download coerentes; split só aplica duas regiões após confirmação facial, nunca dois recortes padrão da mesma pessoa.

Diagnóstico inicial: `clipSettings` limita edições aos limites da IA; `EditorTimeline` altera `editPlan` sem sincronizar o intervalo externo e “Corte simples” restaura esse intervalo antigo; seek do editor também prende o cursor no plano. `Cortar tempo` apenas foca um campo. O split ativa `defaultSplitScreen` antes da detecção; a detecção conservadora já existe, mas não governa a ativação. Graphify em df1186b consultado para VideoEditor/UploadScreen/clipSettings/openClipWorkspace/effectiveSegments; fontes e diffs locais complementam o índice que não inclui estas alterações.

Aceite desta correção: regressões reproduzidas antes da mudança; edição contínua e desfeita/refeita; salvar/reabrir/inspecionar/baixar respeitam ampliação; fixture FFmpeg confirma duração e composição; split sem par não altera a composição e par real gera painéis distintos. Validação estética permanece humana. Nenhum teste de modelo, projeto semeado ou build paralela.

- 2026-10-25: referências e contexto lidos, Graphify em df1186b. Branch codex/usabilidade-editor-envio-split criada sem duplicar checkout/cache; pendências documentais anteriores preservadas.
- A ferramenta não permite criar outra meta enquanto a anterior está pausada; mantenedor autorizou reutilizar o plano da meta existente. O estado da ferramenta continua paused; execução destas tarefas é autorizada pelo pedido atual, sem afirmar retomada da calibração ou conclusão do objetivo antigo.
