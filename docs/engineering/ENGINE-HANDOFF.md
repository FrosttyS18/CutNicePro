# CutNicePro — handoff para o motor

Estado: 03N, revisão documental de 2026-10-19 sobre o código após 03M. Interface, importação, ASR, clipes e render possuem implementação; qualidade de conteúdo e parte do fluxo continuam em revisão. Os defeitos relatados pelo mantenedor não foram corrigidos por esta atualização de documentação. Home aprovada; demais telas PENDING HUMAN APPROVAL. Nenhuma instalação, alteração de modelo ou envio a provedor é autorizado por este documento.

## Fluxo vigente

1. Home/Meus Projetos → Novo projeto → arquivo local → importação gerenciada e visão do projeto. YouTube continua apenas referência/iframe.
2. A visão do projeto reproduz o vídeo de entrada, sem aplicar as edições. Ferramentas abrem editor, legenda/enquadramento, transcrição e geração/exportação.
3. Transcrever abre escolha contextual de modelo/processamento e job real. Turbo é padrão; Large completo ainda consta na UI/backend, com retirada decidida e implementação pendente.
4. Gerar cortes pede quantidade, duração máxima e formato (9:16 inicial). A coleção salva aparece em Clipes de todos os projetos ou Cortes do projeto individual.
5. Abrir um clipe salvo não inicia processamento. A inspeção reproduz seu intervalo, transcrição e análise salva; Analisar trecho é explícito. Rejeitar persiste e sai dos ativos; consultar Rejeitados permite reavaliar.
6. Editor separa configurações do vídeo completo e de cada clipe. Salvar mantém ajustes; exportação do clipe exige aprovação. Exportar vídeo renderiza MP4 real, diferente de copiar o original ou baixar TXT/SRT.

Falhas/cancelamento preservam o resultado publicado anterior. Há gate global exclusivo, não fila persistente completa. Retomada implementada especificamente para blocos ASR; não prometer retomada de qualquer estágio ou execução concorrente de modelos.

## Implementado e limites atuais

| Capacidade | Fonte do código | Funcionamento e limite |
|---|---|---|
| Importação/projetos | `App.tsx`, `media_import.rs`, `media_store.rs`, `storage.rs` | Cópia, SHA-256, deduplicação/referências, metadados ffprobe, cancelamento/reconciliação; não é só arquivo da sessão |
| Workspace/edição | `workspace-types.ts`, `workspace-store.ts`, `useWorkspaceData.ts`, `clip-workspace.ts` | Workspace v2/localStorage; mídia gerenciada reconecta por mediaId; settings/videoSettings/clipEdits separados; histórico completo de versões não existe |
| Transcrição | `transcription/runner.rs`, `profiles.rs`, `checkpoints.rs`, `chunk_text.rs` | whisper.cpp pt/DTW, CPU ou CUDA descoberto; 180 s centrais + 2 s de contexto, checkpoints validados e tempos absolutos |
| Busca/legenda | `TranscriptPanel.tsx`, `captions.ts`, `CaptionPresetsDialog.tsx` | Texto real, busca/seek/edição, estilos e efeitos; não são apenas amostras estáticas. Precisão e sincronia dependem do resultado e da avaliação humana |
| Timeline | `media_preview/`, `VideoEditor.tsx` | Miniaturas e waveform extraídas da mídia; transporte, limites e zoom; sem editor multitrack completo |
| Seleção/nota | `clips/selection.rs`, `generation.rs`, `analysis_types.rs` | Qwen3-4B textual lê janelas sobrepostas e escolhe intervalos sem sobreposição; nota Gancho/Desenvolvimento/Fechamento 40/30/30; não previsão de viralização |
| Análise | `clips/semantic.rs`, `evidence.rs`, `ClipDetails.tsx` | Resumo e três critérios com citações montadas da fala; validação de citações não garante interpretação natural/correta. Relato do mantenedor confirma linguagem técnica/metalinguística inadequada |
| Enquadramento | `clips.ts:isolatedClipSettings`, `ClipFormatPicker.tsx`, `VideoPreview.tsx` | Formato persistido não implica preenchimento: padrão de novos clipes é contain. Cover e ponto focal manuais existem; rastreamento/reenquadramento automático não |
| Inferência textual | `clips/text_engine.rs` | llama.cpp/Qwen3-4B Q4_K_M, GPU Vulkan detectada e ajuste de memória; uma tentativa CPU após falha/cancel check; diferente de Qwen3-ASR |
| Cenas | `clips/scene_regions.rs` | FFmpeg detecta transições perto dos limites dos candidatos, com cache; não interpreta imagens/ações/emoções |
| Render/export | `render/pipeline.rs`, `encoder.rs`, `ass.rs` | Trim, proporção/fit/foco, áudio/texto e legendas ASS; NVENC sondado ou libx264; ffprobe valida duração/dimensões/áudio antes de publicar |
| Persistência nativa | `transcription/store.rs`, `clips/store.rs` | Transcrição, formato/intervalos/análise/revisão dos clipes em app-data; ajustes finos do editor continuam no localStorage |

Stack concreta: React/TypeScript/Vite, Tauri/Rust, CSS/tokens e Phosphor; dependências em package.json/Cargo.toml. Supabase, BYOK, colaboração, credenciais, download YouTube, exportação em lote e distribuição instalável dos motores não estão implementados.

## Prioridades confirmadas pelo mantenedor — implementação ainda pendente

1. Estudar o funcionamento dos projetos open-source indicados antes de adaptar capacidades. Usar a lista existente em OPEN-SOURCE-ENGINE-RESEARCH.md; registrar arquivos/funções/revisão, contratos, dependências/licença, escolhas de adaptação e testes. Pesquisa de README não substitui esse estudo.
2. Análise voltada ao conteúdo: descrever acontecimentos concretos, contexto, reação e desfecho em português natural. Evitar explicações como “a fala inicial introduz o tema central” no resumo destinado ao usuário. O print do Opus orienta a experiência desejada; não comprova nossa equivalência ou autoriza inventar fatos.
3. Clipes 9:16 devem preencher o quadro conforme o objetivo de publicação, com sujeito e legenda preservados. Resolver a composição/preenchimento e testar prévia, miniatura, editor e render; só persistir aspect ratio não atende ao aceite. Não aplicar o crop à visão original do projeto.
4. Manter Whisper Large v3 Turbo e retirar Large v3 completo da escolha/execução do produto. Preferência qualitativa do mantenedor no vídeo testado, não benchmark universal de precisão. Preservar transcrições/projetos e histórico das comparações; não apagar pesos por consequência desta atualização documental.
5. Validar novamente os defeitos quando forem implementados; testes anteriores permanecem evidência histórica de contratos, não aprovação destes resultados. Demais itens de lote/YouTube/BYOK seguem o backlog e exigem escopo próprio.

## Critérios para considerar a primeira fatia funcional

- Importar um vídeo real, reiniciar o app e reabrir sem reenviar o arquivo quando a política de armazenamento permitir.
- Transcrever fala verificável; persistir resultado real e posições em segundos; buscar e navegar ao ponto correspondente.
- Cancelar/falhar sem deixar job preso ou projeto sem recuperação; nenhum falso sucesso.
- Exportar trecho curto com duração/proporção/áudio/legendas corretos; reproduzir o arquivo resultante.
- Validar no Tauri real as permissões, IPC, arquivos e processos. Testes de navegador com IPC simulado não substituem esse aceite.
- Testes proporcionais: uma rodada inicial e uma repetição justificada; preservar aprovados e respeitar VALIDATION-POLICY.md. Estética aprovada exclusivamente pelo mantenedor.

## Evidências e limites — separar estado atual de histórico

03M registrou 247 casos únicos aprovados, incluindo processamento nativo delimitado de geração, retomada ASR e NVENC; aplicativo completo não foi automatizado. Isso comprova os contratos exercitados, não qualidade editorial, preenchimento 9:16 ou precisão ASR. O relato seguinte do mantenedor reabre os dois primeiros como defeitos e define retirada do Large completo. REVIEW/SPEC existentes de confiabilidade e isolamento detalham limites; a 03N altera somente documentação.

03E: build, 30 unitários e 12 runtime únicos com IPC simulado. 03F: build e quatro casos runtime focados em modal, escolha salva, cursor/teclado, responsividade e console. Nenhuma destas evidências comprova IA ou exportação. Ver docs/reports/evidence/03e e 03f e relatórios de histórico.

O plano antigo de começar pela mídia persistente já foi executado; próximas tarefas são as prioridades acima. Não redesenhar a Home nem reabrir decisões visuais aprovadas por consequência desta revisão.

## Histórico — pesquisa de ferramentas de 2026-10-19

Comparação de 10 candidatos e ordem proposta em ../references/OPEN-SOURCE-ENGINE-RESEARCH.md. Manter stack atual; proposta inicial FFmpeg + avaliação whisper.cpp, com yt-dlp em etapa própria para links. Nenhum motor adicional instalado nesta pesquisa. Antes de copiar código, verificar licença e versão, inclusive modelos e dependências. Correções de UI M2A em evidence/m2a-fix têm validação runtime parcial por falha do harness e orçamento esgotado; não promovê-las a integração nativa aprovada.


## Histórico — continuidade M3A inicial (2026-10-19)

Transcrição local inicial implementada em módulos próprios, com whisper.cpp CPU/Base no desenvolvimento, cancelamento e persistência por projeto. Contrato: M3A-TRANSCRIPTION-SPEC.md; roteiro humano: M3A-MANUAL-CHECK.md; decisões e hashes: ENGINE-DECISIONS.md §5. Mantenedor restringiu validação a código, sem navegador/abertura do app. Não tratar ASR, qualidade ou M3 completo como aprovados: runtime e benchmark pendentes; exportação/YouTube/BYOK continuam fora desta entrega.

## Histórico — continuidade 03I (2026-10-19)

Large v3 Turbo/DTW preservados após relato positivo do mantenedor. Editor possui CaptionStyle opcional validado/persistido, visual de legendas compartilhado com predefinições/fonte/efeitos e transporte com Espaço. Menu de contexto nos cards exporta cópia da origem e TXT/SRT reais com seletor nativo; não é render MP4 com cortes/efeitos. Contratos/limites: EDITOR-CONTROLS-SPEC.md; testes somente em código, runtime reservado ao mantenedor. Compartilhamento explicitamente adiado. Não reintroduzir avisos internos na interface.

## Histórico — modo experimental de qualidade Gemma 4 (2026-10-20, atualização 8)

Backend experimental integrado ao app sem trocar a produção: `Options.quality` (ausente = padrão) seleciona o motor em `text_engine::Engine` (Standard = Qwen3-4B ChatML/temp 0, EXATAMENTE como antes; ExperimentalGemma = Gemma-4-12B-IT QAT Q4_0, template canônico do GGUF, temp 1,0/top_k 64/top_p 0,95/min_p 0/seed 42, sem `--fit`, sem fallback de modelo). Janelas do experimental com orçamento REAL de tokens (`llama-tokenize`, `windows_budgeted`, subdivisão com sobreposição na costura). Prompt de descoberta do experimental = `discover-prompt.txt` (unidades narrativas da atualização 7 do experimento). Coleções carregam `engine` (metadado técnico); análise antiga só é reaproveitada entre coleções do MESMO backend (`merge_previous`); reanálise usa o motor de origem. Config local preparada: `.tooling/vendor/analysis/engine-gemma.json` → artefato verificado em experiments (home-e). Reversão: usar "Padrão" na UI; para desativar, remover engine-gemma.json. Limites conhecidos: geração ~3,4 tok/s (perfil Vulkan 12B) + recarga por chamada; variabilidade de resultado entre amostras (temp 1,0 documentada) — detalhes e medições em experiments/clip-selection-ab/reports/integration-comparison.md. Adoção como padrão depende do mantenedor.
