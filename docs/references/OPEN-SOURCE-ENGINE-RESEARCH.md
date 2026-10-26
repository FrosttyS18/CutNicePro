# Referências open source para o motor do CutNicePro

Pesquisa em 2026-10-19 para continuidade com ZCode. Recomendação: manter React/Tauri/Rust e integrar capacidades pequenas por adaptadores. Preservar a UI do CutNicePro. Esta pesquisa não instala motores nem aprova incorporar código de terceiros.

## Ampliação do estudo de cobertura — 2026-10-25

### Editor: arrasto, limites e histórico — código consultado em 2026-10-25

- OpenCut Classic `cf5e79e919144200294fb9fed22a222592a0aeea`, MIT: lidos `timeline/hooks/use-timeline-resize.ts`, `controllers/resize-controller.ts`, `group-resize/compute-resize.ts` completos e as funções TimelineElement/ElementInner/ResizeHandle de `components/timeline-element.tsx`. Deslocamento horizontal vira tempo; draft durante o gesto e commit único no fim; cancelamento descarta a prévia. O cálculo distingue fonte, trims e posição, respeitando mídia/vizinhos. Alças pertencem ao elemento. Estudo estático, sem executar OpenCut nesta tarefa.
- Twick `3044c23e282b87c639c3f0b3fd5fb3fd972aa04c`: lidos `packages/video-editor/src/components/track/track-element.tsx`, `hooks/use-timeline-control.tsx`, `packages/timeline/src/core/elements/video.element.ts`, `context/undo-redo-context.tsx` e LICENSE.md. Draft no arrasto, confirmação ao terminar e delegação das ações ao editor. Esses arquivos isolados não comprovam limitação de toda edição à duração da fonte. Licença consultada: Sustainable Use License v1.0. Não instalado nem incorporado.
- Aplicação própria: manter EditPlan em segundos da fonte e histórico existente; ampliar a seleção até a mídia real; draft e commit único do trim. Seleção passa a pertencer ao contêiner de miniaturas/áudio, sem distância fixa da régua; alças externas e cabeçalho com três grupos. Nenhum outro motor foi transplantado.
- Split: no wardigs-corte103,72–183,90s havia quatro rostos na fonte e dois na área central, seguidos de closes. O gate de exatamente dois em todas as amostras rejeitava tudo. Agora cada cena tem três amostras, YuNet960/confiança0,8 e seleção na área visível. `shots` guarda somente pares confirmados; fora dessas janelas, prévia/export usam quadro único. O estudo SupoClip anterior orientou a separação por plano. FFmpeg0,10 capturou cinco transições verificadas nesse trecho; isso não comprova detecção universal.

Fontes fixas: [OpenCut controlador](https://github.com/OpenCut-app/opencut-classic/blob/cf5e79e919144200294fb9fed22a222592a0aeea/apps/web/src/timeline/controllers/resize-controller.ts), [cálculo](https://github.com/OpenCut-app/opencut-classic/blob/cf5e79e919144200294fb9fed22a222592a0aeea/apps/web/src/timeline/group-resize/compute-resize.ts), [alças](https://github.com/OpenCut-app/opencut-classic/blob/cf5e79e919144200294fb9fed22a222592a0aeea/apps/web/src/timeline/components/timeline-element.tsx), [Twick](https://github.com/ncounterspecialist/twick/blob/3044c23e282b87c639c3f0b3fd5fb3fd972aa04c/packages/video-editor/src/components/track/track-element.tsx).

### Nova frente de usabilidade: split screen e editor — estudo dirigido, 2026-10-25

Leitura estática do SupoClip oficial local fixado em `72f1659d4e6dd65c925960239249fe6d04871e45`, licença AGPL-3.0. Em `backend/src/media/reframing.py`, `detect_faces_in_clip`/`cluster_two_face_regions` amostram rostos e separam centros esquerda/direita, dimensionando duas regiões; `detect_speaker_reframe_plan` exige fonte horizontal e limita o caso de muitos cortes de cena. O modo `vertical_split` devolve regiões, sem precisar do LLM textual para compor a imagem. O caminho de render faz dois crops, escala cada painel para1080×960, empilha com `vstack` em1080×1920, mantém o áudio original e aplica legendas na composição. Ausência de plano válido recorre ao caminho de enquadramento disponível; isso não comprova rastreamento geral ou identificação biométrica. Não foi executado um teste novo de split screen nesta etapa nem incorporado código AGPL.

Em `frontend/src/components/home-app.tsx`, a criação oferece formatos `vertical`, `vertical_fit`, `vertical_pan`, `vertical_split` e `original`. A referência enviada pelo mantenedor orienta uma composição compacta; não autoriza apresentar recursos de URL, cleanup ou layouts como operantes antes de sua integração real. No CutNicePro, `UploadScreen` já possui importação persistente por caminho e estados distintos de seleção/preparação. `TimelineSurface` implementa seek por arrasto, sem alças de trim; `EditorTimeline` usa campos e ações de dividir/remover sobre EditPlan v1. Portanto, trim por arrasto exige nova interação ligada ao plano existente, não trocar o motor ou afirmar que a alça já existe.

Documentação oficial OpusClip consultada: [trim e extensão](https://help.opus.pro/docs/article/trim-extend-the-video) descreve remover por texto e arrastar bordas de segmentos; [layout por cena](https://help.opus.pro/docs/article/apply-the-layouts) distingue layout global, por cena e composição de participante/B-roll. Isso comprova o fluxo público descrito, sem revelar o algoritmo proprietário de seleção. Proposta: separar importação/configuração, descoberta textual e composição/edição/render por contratos tipados, com prévia e exportação consumindo o mesmo plano. Metas propostas no BACKLOG; nenhuma dessas capacidades novas foi implementada nesta leitura.

Leitura dirigida de cinco origens adicionais, com revisões e licenças conferidas no GitHub. Foram examinados os arquivos e mecanismos abaixo; não é estudo integral dos repositórios, execução de seus pipelines ou comprovação de superioridade editorial. Nenhum pacote/modelo dessas origens foi instalado nesta fatia. O protótipo lexical descrito adiante é próprio e usa apenas a biblioteca padrão do Python.

| Origem, revisão e licença | Código e contrato examinados | Dependências pertinentes e limite da adaptação |
|---|---|---|
| [ClipsAI/clipsai — `8e73c8adc112c745b84ec240f11a91457bfd3141`](https://github.com/ClipsAI/clipsai/tree/8e73c8adc112c745b84ec240f11a91457bfd3141), MIT | `clipsai/clip/clipfinder.py`: `find_clips`, `_text_tile_multiple_rounds`, `_text_tile`; `texttiler.py`: `text_tile`, `_calc_gap_scores`, `_calc_depth_scores`, `_identify_boundaries`; `text_embedder.py`: `embed_sentences`. Sentenças timestampadas → embeddings → quedas de coesão entre blocos adjacentes → intervalos em várias escalas. | `TextEmbedder` carrega `all-roberta-large-v1` por SentenceTransformer; cálculo usa Torch/NumPy. `setup.py` também inclui ferramentas de mídia/ASR. Não importar esse conjunto nem baixar o modelo para reproduzir apenas o sinal de coesão. `tests/test_clip.py` lido cobre configurações, não recuperação das seis histórias. Mudança tópica não prova desfecho. |
| [nltk/nltk — `7cb7337a35d6baed6c18d4b6c630b082bdbd1d66`](https://github.com/nltk/nltk/tree/7cb7337a35d6baed6c18d4b6c630b082bdbd1d66), Apache-2.0 | `nltk/tokenize/texttiling.py`: `TextTilingTokenizer.tokenize`, `_block_comparison`, `_depth_scores`, `_identify_boundaries`, `_normalize_boundaries`. Frequências lexicais → cosseno/depth → fronteiras encaixadas em parágrafos. | Usa NumPy; o construtor padrão consulta o corpus de stopwords em inglês. Não é segmentador de ASR português pronto: a normalização para parágrafos e as unidades de texto exigiriam adaptação. A variante lexical dispensa embeddings, mas não demonstra fechamento narrativo. |
| [garrettregister/AI-Youtube-Shorts-Generator — `776367175d1e34399290952223fe5a3315cd3905`](https://github.com/garrettregister/AI-Youtube-Shorts-Generator/tree/776367175d1e34399290952223fe5a3315cd3905), MIT | `shorts_generator/highlights.py`: `detect_content_type`, `build_transcript_text`, `call_highlight_api`, `get_highlights`, `dedupe_highlights`; `local/llm.py`: `call_openai_compatible_llm`. Classifica tipo/densidade por amostra; propõe intervalos e notas; pede quantidade mínima e elimina sobreposições. | O adaptador compatível usa `openai` e admite Ollama/llama.cpp. `requirements-local.txt` inclui yt-dlp, faster-whisper, WhisperX, OpenCV e clientes opcionais; FFmpeg participa do render. O padrão também possui caminho MuAPI, não exclusivamente local. Não adotar quantidade mínima, supressão de versões úteis, classificação por amostra como substituto da fonte inteira ou fallback de provedor. |
| [mehbul/chopify — `0d13b4a8ac8b91fd309cd54ffe8431bd3b13c5b6`](https://github.com/mehbul/chopify/tree/0d13b4a8ac8b91fd309cd54ffe8431bd3b13c5b6), MIT | `score_clips.py`: `sentenceize`, `is_arc_complete`, `_grow_window`, `build_candidates`, `ollama_select`; `semantic.py`: `search`, `candidates`. Heurística/LLM local → janelas de fala; busca semântica ordena sentenças por similaridade. | Seleção heurística e HTTP usam stdlib; modo semântico requer servidor/modelo de embeddings Ollama (`nomic-embed-text` por padrão). `requirements.txt` lista yt-dlp, faster-whisper e OpenCV; render usa FFmpeg. `is_arc_complete` verifica pontuação terminal, não conclusão semântica. Crescimento por duração, fallback heurístico e manutenção do melhor candidato abaixo do piso não foram adotados. |
| [kakha13/youtube-shorts-generator — `48e780647f95e290f92694ea60cafc4bea0acd25`](https://github.com/kakha13/youtube-shorts-generator/tree/48e780647f95e290f92694ea60cafc4bea0acd25), MIT | `shortsgen/highlights.py`: `find_highlights`, `_call_model`, `_build_highlight`, `snap_window`, `deduplicate`; `anchor.py`: `find_quote`, `_candidate_starts`, `resolve_span`. Propõe candidatos com citações/notas; localiza texto, ajusta sentenças e ordena. | `pyproject.toml` inclui `openai`, faster-whisper, yt-dlp, OpenCV headless e dotenv; FFmpeg é externo. Matching usa `difflib.SequenceMatcher`, limiar 0,6 e fallback para tempos do modelo. Não portar essa tolerância, alongamento por duração ou fallback numérico: o CutNicePro deve preservar sua fundamentação mais estrita. Sobreamostragem não comprova histórias distintas. |

### Protótipo lexical próprio — REJECTED

Laboratório ignorado: `.tooling/test-output/goal-story-coverage-2026-10-25/lexical_probe.py`, configuração em `lexical-config.json`, resultados integrais `lexical-davyjones.json`/`lexical-ux.json` e revisão em `lexical-review.json`. Parâmetros declarados antes dos resultados: escalas de 3/5 unidades de frase, suavização 3, cosseno de frequências e depth com limiar média + 0,5 desvio-padrão populacional; máximos locais, sem quota, nomes/tempos da referência ou inferência. Não são os parâmetros padrão do NLTK nem uma execução do ClipsAI.

A primeira representação por palavras foi recusada por omitir texto presente nos segmentos: Davy tem 54 divergências com arrays de palavras presentes e 2 arrays vazios; UX tem 62 divergências. A única repetição corrigiu a representação para o texto completo e os tempos originais dos segmentos, sem alterar os parâmetros. A junção preservou integralmente os textos dos 334/568 segmentos. Sem interpolar tempos internos, a pontuação disponível produziu 217 unidades Davy e 373 UX; uma unidade Davy de 472,78–530,16 s reúne o final do PUBG e o episódio do PC, limitando a própria proposta de fronteiras.

Resultados: Davy gerou 12/17 spans nas escalas 3/5 e UX 42/36; são propostas estruturais, não cortes publicados. Cálculo observado de 0,023/0,046 s, sem inferência ou render, não é benchmark do aplicativo. Nas 27 fronteiras Davy examinadas, 20 fragmentam turnos/exemplos, 5 são sinais plausíveis de transição e 2 são ambíguas; os 5 sinais contam instâncias entre escalas, não histórias. Dez casos UX foram examinados como exemplos, inclusive quebra da lista antes do quarto critério. A comparação com `docs/reports/evidence/criterio-editorial-assistente-2026-10-24.json` ocorreu depois da geração, sem calibrar o algoritmo. Mudança tópica não recuperou os seis intervalos completos; spans e detector não foram promovidos. Seis JSONs e seis hashes de artefatos foram conferidos; limites dos spans pertencem aos segmentos originais.

### Controles de apresentação da fonte — laboratório, sem promoção

`editorial-stories-2026-10-25/goal-inline-coverage/`, sob `.tooling/test-output/`, manteve a transcrição integral e marcou no próprio texto quais falas já tinham sido usadas na execução. Produziu 8 propostas em 41,485 s, sem comprovar melhora editorial. Auditoria exata offline encontrou 7 pares de âncoras literais únicos com ao menos 4 palavras; não equivale a PASS do parser nativo ou das histórias. Uma proposta chama de Secute um intervalo do T-PAP; outra termina em “Não é possível”, com 3 palavras e 5 ocorrências. Há intervalos abaixo de 10 s e fragmentos sem preparação/conclusão. Valve aparece fundamentado em 421,64–455,30 s. O título da descoberta já é descartado pelo produto; corrigir o rótulo incorreto, sozinho, não recuperaria outra história. Controle não integrado.

`goal-inline-reverse/result.json`, no mesmo laboratório editorial, registrou 6 propostas em 39,906 s. A resposta não seguiu a ordem reversa solicitada; Secute termina numa explicação condicional aberta (“se fosse um logo”), e a proposta sobre PUBG passa para o PC/Makita. Rejeitado, sem ganho editorial declarado ou promoção. A apresentação da fonte não autoriza remover recusas nem contar publicidade/fragmentos como histórias recuperadas.

Controle de idioma **REJECTED**: a nota `goal-inline-coverage/chinese-discovery-note.json` preparou a tradução própria da instrução de descoberta para chinês, mantendo transcrição/âncoras em português, título em português brasileiro e o mesmo Qwen3.5-4B/32K, amostragem, schema e limites. `goal-chinese-only/result.json` registra a única execução, com 334 segmentos integrais, 7 propostas e 33,281 s. Não recuperou Valve nem o episódio do PC; rotulou como Secute um T-PAP interrompido, fragmentou QR Code/pistolas e, no caso do save, escolheu como fechamento a seleção de outra barba, anterior ao crash da abertura. Não integrado; sem rodada UX ou repetição da tradução. O `PROMPT` chinês do AutoClip demonstra viabilidade de uso, mas também muda títulos, quantidade e seleção; não isola o idioma nem prova vantagem sobre português. Thinking também não é hipótese nova: os controles anteriores de 4B em 91,04/73,64 s e a comparação inicial instruct/thinking já falharam em bordas/fatos, conforme o handoff. Não repetir esses braços sob o rótulo de pesquisa nova.

## Comparação dos 14 MP4s do Opus — 2026-10-25

### Controles adicionais de descoberta — 2026-10-25

Releitura pertinente: AutoClip `backend/pipeline/clip_finder.py` em `3d3b5edf9ffa595a764b0919e6dbd4ce8acaca84` (MIT) organiza seleção por fonte/janelas e referências de falas; SupoClip `backend/src/ai.py` em `72f1659d4e6dd65c925960239249fe6d04871e45` (AGPL-3.0) distingue descoberta, validação/dedupe e comparação dos candidatos. Repositórios não foram reexecutados nesta fatia; execuções anteriores continuam identificadas abaixo. Não foi portado código AGPL. Comparação relativa e cobertura adicional são hipóteses, não garantias: controles próprios de finais preferiram intervalo completo no T-PAP mas uniram outro assunto em EAFC/Valve. Cobertura regional com a fonte inteira produziu 4→5 arquivos, acrescentando fragmento do mesmo episódio, não nova história; experiência rejeitada e removida do fluxo normal.

Pedido humano livre, sem JSON/filtros, com transcrição integral timestampada: Qwen3.5-4B produziu 4/3 propostas em temperaturas 0,4/0,7; Qwen3.5-9B/64K produziu 4 com omissões/finais fora dos tempos. Ministral 3 8B produziu 5 livres e 8 no prompt de extração atual; seis pares literais únicos no segundo controle, mas T-PAP termina antes da explicação. Quantidade bruta não equivale a cortes aprovados. A resposta GLM apresentada pelo mantenedor sugere scripts/CTAs novos, rejeitados como fala final de cortes do original. Formulário de preferências pode orientar pedidos, mas não corrige proveniência nem autoriza nova interface nesta fatia.

Pesquisa de modelos em fontes oficiais: [Ministral 3 8B](https://huggingface.co/mistralai/Ministral-3-8B-Instruct-2512), [GGUF oficial](https://huggingface.co/mistralai/Ministral-3-8B-Instruct-2512-GGUF), [Phi-4-mini](https://huggingface.co/microsoft/Phi-4-mini-instruct) e [Granite-4.0-micro](https://huggingface.co/ibm-granite/granite-4.0-micro). Somente Ministral foi baixado/testado, por autorização expressa. Template nativo e temperatura 0,05 seguem a família; fonte completa em 16K coube sem truncagem. Não comparar só número de parâmetros ou tamanho do arquivo com memória total: contexto/cache e concorrência também consomem recursos. Nenhum desses controles justifica trocar o padrão ou anunciar superioridade editorial. Evidência completa em `docs/reports/evidence/editorial-stories-2026-10-25.json`; parâmetros/hashes no TOOLING e handoff.

### Arquivos e comportamentos observados

Atualização autorizada após a comparação: em 2026-10-25 o mantenedor pediu permitir versões sobrepostas/contidas e teto de 16. O baseline de 12/intervalos disjuntos descrito a seguir foi substituído; dedupe agora se limita à identidade/mesmo intervalo e formato no job. Não se trata de reprodução do algoritmo Opus nem de garantia de 16. Bordas/cenas independentes e lote facial compatível cobrem os consumidores afetados; qualidade própria de cada versão permanece necessária.

Fonte primária local: os 14 arquivos fornecidos pelo mantenedor em `C:/CutNicePro/Opus teste`, todos preservados e ignorados no Git. Inventário com duração, SHA-256, correspondências de áudio e limites em `docs/reports/evidence/opus-comparison-2026-10-25.json`. FFmpeg/ffprobe reais, correlação espectral contra a fonte integral de 599,098 s e inspeção objetiva de três frames por arquivo. Amostragem não equivale a assistir integralmente cada vídeo nem revela o algoritmo proprietário. Nenhuma inferência/API nova ou mídia enviada nessa comparação dos arquivos.

- **Quantidade:** há variantes sobrepostas. O corte Battlefield de 37,93 s começa no mesmo ponto do de 171,43 s; o EAFC de 17,47 s integra uma história maior. O automático local tem teto 12 e `selection::finalize_weighted` escolhe intervalos sem sobreposição. O teto impede 14, mas NÃO explica sozinho a entrega de apenas quatro ou a falta de assuntos distintos.
- **Gancho antecipado:** no vídeo de R$ 400, áudio em 0,5 s corresponde à fonte em 89,86 s; em 7,5 s corresponde a 50,74 s. A consequência vem antes da explicação. `edit-plan.ts::normalizePlan/planIsValid` e Rust `effective_segments` exigem ordem cronológica: EditPlan v1 não representa esse resultado. Não basta retirar validações ou ordenar o mesmo array de outra forma; relógio, legendas, persistência e export precisam compartilhar uma futura semântica de montagem.
- **História completa:** T-PAP no Opus cobre aproximadamente 168,26–227,73 s. O local 149,40–197,80 s inclui outra abertura e perde a explicação posterior. Valve já é próximo: Opus 427,96–455,19 s, local 428,02–455,30 s. A melhora reconhecida pelo mantenedor permanece; o defeito do T-PAP continua técnico, sem pedir aprovação de um resultado conhecido como incompleto.
- **Composição:** frames comprovam alternância entre falante, grade de participantes e imagem comentada acima das pessoas. Isso supera um `fit/focalPoint` global; não comprova que um modelo multimodal tomou cada decisão. [Documentação de layouts](https://help.opus.pro/docs/article/apply-the-layouts) permite ajuste por cena e composição com B-roll.
- **Exportação:** a [interface pública oficial](https://github.com/opus-pro/opus-skills/blob/main/skills/opusclip/SKILL.md), consultada em 2026-10-25 em main, distingue preview de baixa resolução e export HD com estado de renderização. Também expõe edição por operações/seções. [Exemplo oficial de hooks](https://www.opus.pro/mcp/inspiration/turn-your-best-clip-into-a-three-way-hook-test) descreve antecipar a consequência reorganizando seções. Não foi instalado/executado serviço Opus. Renderizar ao baixar reduz trabalho antecipado, mas não melhora por si a seleção; nosso FFmpeg já renderiza no download.

Ordem proposta para a próxima fatia local: recuperar histórias autônomas distintas da referência humana; avaliar variantes sobrepostas como versões úteis, sem repetir o mesmo intervalo para inflar quantidade; título/resumo fundamentados somente na montagem publicada; depois contrato versionado para gancho reordenado e composição por cena. Proposta, não implementação nem novo aceite. Nenhum motivo demonstrado para reativar multimodal pesado ou substituir Qwen nesta auditoria.

Correção pontual executada: `editorial_repair::apply` perdia `options.fit` ao clonar um draft sem esse campo. Valve reparado persistia `fit:null`, caindo em contain na UI. Agora o reparo preserva cover/contain; teste reproduziu a falha antes e passou depois. O export de laboratório anterior fixava cover e ocultava esse defeito de propagação. Não migra edições salvas do mantenedor.

## Preparação de estudo AutoClip — 2026-10-23

### Pipelines executados com Qwen3.5-4B — 2026-10-24

Feedback manual em 2026-10-25: a política de enquadramento seguro do AutoClip (`backend/services/studio/framing.py`, especialmente `layout_filter`, revisão acima) admite quadro completo com fundo desfocado em planos sem recorte adequado. Isso não autoriza o CutNicePro a substituir a escolha explícita Preencher por contain; essa adaptação foi corrigida em `isolatedClipSettings`. O teste anterior que esperava contain na ambiguidade protegia um comportamento de produto incorreto. Busca de cobertura adicional e alinhamento lexical conservador por até dois tokens são implementações próprias, não código ou pipeline copiados das referências. O reparo próprio agora compartilha o contrato de citações e recebe a fonte integral. Resultados reais e limites continuam no ENGINE-HANDOFF; os prints do Opus são referência de experiência/títulos, sem alegar acesso ao algoritmo interno.

Conferência adicional de `studio/boundaries.py` nessa revisão: `MAX_LEAD_SEC=20` e `MAX_TAIL_SEC=25` delimitam a busca programática de começo/fim de frase; `MODEL_MAX_EXTEND=60` limita a extensão sugerida pelo modelo. `CONTEXT_BEFORE=40` e `CONTEXT_AFTER=75` são SEGUNDOS ao redor do intervalo, não quantidade de linhas. O `merge_gap_sec=5` de `quality.py` permite juntar cortes curtos próximos; não acrescenta cinco segundos a todo corte. São mecanismos distintos, não uma regra de pós-roll fixo. O próprio ensaio Studio anterior terminou o T-PAP em “Aí das duas uma”; portanto essa referência também falhou nesse caso e não foi adotada como garantia de conclusão.

Calibração controlada da descoberta, 2026-10-25: mesmo modelo Qwen3.5-4B Q4_K_M, Vulkan, contexto 32768, seed 42, prompt e schema idênticos por fonte integral; alterada somente a temperatura. Davy: 0,7 → 5 propostas/2 citações exatas/2 intervalos na faixa; 0,4 → 5/5/4; 0,2 → 5/5/5. UX: 0,7 → 12/10/10; 0,4 → 12/12/11; 0,2 → 9/9/8. Contagens por localização EXATA, antes do alinhamento lexical e sem julgar a narrativa. Os braços 0,7 reaproveitam respostas salvas; os outros quatro foram executados. A recomendação oficial geral sem thinking é 0,7/top_p 0,8/top_k 20/min_p 0/presence 1,5/repeat 1. Adaptação adotada: descoberta e reparo em 0,4, avaliação/análise em 0,7; pesos não treinados. 0,4 melhora a cópia nas duas fontes, mas não comprova título, fechamento ou superioridade editorial. Multimodalidade do modelo exige adaptador/projetor/imagens, ausentes no caminho normal; não foi habilitada por esta consulta.

Esta execução amplia os estudos estáticos anteriores: os resultados abaixo saíram dos serviços originais até MP4, sem substituir o pipeline por uma chamada ao prompt. Referências fixadas: AutoClip MIT `3d3b5edf9ffa595a764b0919e6dbd4ce8acaca84`; SupoClip AGPL-3.0 `72f1659d4e6dd65c925960239249fe6d04871e45`. O SupoClip foi obtido da origem oficial FujiwaraChoki/supoclip; o laboratório externo tinha alterações e não foi usado como fonte. Código AGPL não foi incorporado ao app.

| Execução original | Fonte inteira | Entrada ASR | MP4s verificados | Tempo observado |
|---|---|---|---|---|
| SupoClip `VideoService.process_video_complete` → `create_single_clip` | Davy, 599 s | Transcrição real compartilhada, 334 segmentos, cache nativo | 5, 1080×1920 | 104,06 s |
| Mesmo SupoClip sem cache ASR | Davy, 599 s | Whisper Base local original | 3, 1080×1920 | 146,58 s |
| Mesmo SupoClip, janelas internas originais | UX, 1476 s | Transcrição real compartilhada, 568 segmentos | 4, 1080×1920 | 169,49 s |
| AutoClip `local_runner.run_pipeline`, seis etapas | Davy, 599 s | SRT integral fornecido pelo caminho nativo | 3 | 101,82 s |
| AutoClip Studio `quick_output_runner.start/wait` | Davy, 599 s | Mesmo SRT integral | 5, 1080×1920 | 136,63 s |
| Mesmo AutoClip Studio | UX, 1476 s | Mesmo SRT integral | 6, 1080×1920 | 199,64 s |
| AutoClip Studio sem SRT fornecido | Davy, 599 s | faster-whisper Base original, CPU INT8/duas threads | 3, 1080×1920 | 204,26 s |

Mesmo GGUF Q4_K_M e llama.cpp b11829 Vulkan, contexto 32768, inferência exclusivamente local, um servidor por vez. As comparações com ASR compartilhado isolam a seleção/render; as rodadas sem cache do SupoClip e AutoClip também executaram seus transcritores originais. AutoClip consumiu os 599,098 s de áudio, detectou português e gerou SRT próprio; Whisper Base convertido Systran na revisão `ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66` foi preparado no cache do laboratório antes do cronômetro e o Hugging Face ficou offline durante a inferência. Essa variante produziu três MP4s, inclusive títulos equivocados sobre os nomes discutidos e o ruído do PC: não sustenta substituir o Turbo do app por Base. Serviços de UI, contas, billing e publicação externa não foram exercitados. Tempos são destas fontes/configurações, sem alegação de benchmark universal. Arquivos, SQLite, cache e temporários isolados em `.tooling/test-output/pipelines-comparados-2026-10-24`; nenhum projeto de laboratório criado no perfil do mantenedor.

O caminho normal do AutoClip dividiu Davy em três blocos e juntou assuntos para atingir duração mínima; inclusive juntou o ruído do PC com o patrocínio. O Studio chama `jobs.run_content` → `process_video_pipeline(clips_only=True)` → `pipeline.clip_finder.find_clips`, depois `studio.boundaries`, enquadramento/empacotamento/render nativos. Não confundir os dois caminhos. O Studio encontrou episódios mais próximos da referência, mas atribuiu indevidamente EAFC a um título e prolongou Valve até o assunto seguinte. Os presets de audiência produziram títulos/empacotamento em inglês/chinês; não são configuração pronta para nosso público brasileiro.

O SupoClip fez duas janelas internas sobrepostas no vídeo de 24,6 min; isso é comportamento original da referência, não recorte manual de amostras favoráveis. Seu corte dos quatro critérios incluiu a apresentação inicial, mas também a pergunta seguinte no final. Outro corte terminou numa oração aberta sobre bootcamp. Logo, exportar vários arquivos ou dar nota alta não comprova autonomia e conclusão. A primeira execução encontrou incompatibilidade OpenCV 5 e usou fallback original de quadro inteiro; ambiente isolado foi fixado em OpenCV 4.12/NumPy 2.2.6 antes da rodada com ASR nativo. Não alteramos a fonte original para ocultar a falha.

O que preservar/adaptar: descoberta sobre a fonte completa, localização verificável na transcrição, refinamento antes de rejeitar e renderização com contratos comuns. O que não copiar: preenchimento por quantidade/duração, alongamento mecânico para o próximo assunto, títulos sem suporte na fala e instaladores/serviços do projeto inteiro. Os resultados não sustentam substituir nosso pipeline inteiro por uma dessas referências sem controle editorial.

Aplicação própria resultante: automático pede pequenas citações de abertura/fechamento e o código resolve os limites na fonte, recusando citações ausentes, ambíguas ou invertidas. Não há aproximação semântica nem timestamps inventados. Personalizado preserva seu contrato de IDs. O título da descoberta é descartado, a nota só vem da avaliação real e os filtros existentes permanecem. Teste nativo do app: Davy inteiro gerou 2, repetir gerou +2 sem veto pela biblioteca e preservou registros/edições anteriores; UX inteiro gerou e exportou 8 em 492,44 s. Os dez MP4s do app foram conferidos no destino por ffprobe e SHA-256, 1080×1920 com áudio, diferença de duração máxima 0,034833 s. Qualidade editorial permanece PARTIAL: Davy não recupera os seis episódios de referência e um título de UX introduziu “cliente”, ausente nas falas incluídas. Esses defeitos não foram ocultados nem corrigidos manualmente nas amostras.

Controles de tokens da nossa descoberta antes da integração das âncoras: entrada completa Davy 5288 e UX 9538 tokens; tetos de saída 4096 e 16384 deram respostas estruturadas idênticas em cada fonte, encerradas por `stop` (222/593 tokens). Não houve truncamento. O contexto de 32K inclui instruções, fonte e resposta; preencher a memória artificialmente não aumenta a informação. Mostrar timestamps nas linhas e trocar Q4 por Q8 também não resolveu a fidelidade nesta fonte; Q8 permanece experimento, sem promoção ao app. Não confundir ajuste de prompt com treinamento dos pesos.

Pesquisa pública adicional: o [manual oficial de prompts do OpusClip](https://help.opus.pro/docs/article/clip-anything-prompt-manual) separa pedido de conteúdo dos controles de duração/formato; a [tabela oficial de quantidade](https://help.opus.pro/docs/article/how-many-clips) é orientação aproximada, não garantia. A [página ClipAnything](https://www.opus.pro/clipanything) descreve sinais visuais/sonoros e seleção, mas não publica seu algoritmo, pesos ou prompts internos. Portanto não alegamos ter reproduzido a implementação do OpusClip. Parâmetros de inferência conferidos na [ficha oficial Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B); suporte/contratos do servidor no [llama.cpp b11829](https://github.com/ggml-org/llama.cpp/blob/b11829/tools/server/README.md).

Comparação de modelos em 2026-10-24: GPT-OSS-120B na Groq recebeu a transcrição integral de dez minutos e ainda propôs finais incompletos e títulos apoiados em falas externas ao intervalo. Conferir citações literalmente detecta inexistência/ambiguidade, mas não comprova fidelidade do título nem unidade narrativa. As experiências não justificam retirar gates de qualidade ou copiar preenchimento obrigatório de quantidade. Z.ai/Gemini ficaram indisponíveis; não há resultado editorial para compará-los. Inventário e próximos testes locais no TOOLING/ENGINE-HANDOFF.

### Aplicação local — prompts e rostos, 2026-10-24

Revisões locais reconferidas: zhouxiaoka/autoclip `3d3b5edf9ffa595a764b0919e6dbd4ce8acaca84` e artbyjazi/autoclip `5d0eac36fa615b79dd2104083bf273a96f8d68bb`. Releitura integral nesta tarefa: `backend/pipeline/clip_finder.py` e `backend/services/studio/framing.py` do principal; trechos de `quality.py`, `boundaries.py`, testes `test_clip_finder.py`/enquadramento e fronteiras do complementar foram consultados para os contratos pertinentes. Isso não é nova leitura integral dos dois repositórios, nem prova de superioridade editorial.

O principal seleciona unidades completas em uma chamada por janela, com linhas compactas e retorno validado de IDs, título, razão e score. Em seguida aplica duração/dedupe. Não é treinamento de modelo próprio e seus números de execução em nuvem não são transferíveis ao nosso Gemma local. Nossa entrada já usa arrays compactos e tokenização real: preservar esse orçamento é mais seguro que copiar os 12 mil caracteres/20 minutos da referência. Não adotar a obrigação de títulos em chinês, notas de viralização ou preenchimento até duração mínima. Adotados: pergunta/apresentação até a resposta concluída; o título não pode compensar contexto ausente; retorno explícito de autonomia/conclusão e recusa por código mesmo com nota alta; contexto externo delimitado em 30 s por lado e separado do texto realmente incluído. Bordas alteradas por cenas/frases precisam de sua própria avaliação antes de serem aceitas.

Revisão do descarte, 2026-10-24: a regra de contexto externo acima descreve a primeira implementação. O diagnóstico real encontrou avaliações contaminadas pela continuação e por outros candidatos. No refino atual, só a descoberta e o reparo recebem contexto vizinho; a avaliação usa exclusivamente toda a fala do intervalo. O resultado completo, com título, resumo, critérios e evidências, é reutilizado na publicação do mesmo intervalo. Mudanças nas bordas exigem novo resultado e assinatura própria. Não reduzir critérios para preencher quantidade.

Fontes reconferidas nesta correção: AutoClip `3d3b5edf9ffa595a764b0919e6dbd4ce8acaca84`, `backend/pipeline/clip_finder.py` (PROMPT, windows, _parse, _dedupe, find_clips) e `quality.py:select_clips` (MIT). A descoberta produz faixa/título/razão/score na mesma chamada; o pós-processamento valida, refina e seleciona. `min_keep` pode completar a lista abaixo do threshold, com marcação fallback: essa política não foi portada, pois não comprova integridade narrativa.

SupoClip: clone local `C:/SupoClipLab/supoclip` em `f1a0c30f8d9ea9e6944b12cef054d92d65219a14`, com instrumentação LAB-BENCH preexistente identificada; fonte remota reconferida pelo conector GitHub em `f68afc5b516703f7ed56fe220c55ff6c082af0a0`, `backend/src/ai.py` (AGPL-3.0). Módulos pertinentes lidos: modelos de saída, transcript_analysis_system_prompt, build_transcript_analysis_prompt, _snap_bounds_to_transcript_lines, _repair_segment_bounds, _validate_segments, dedupe_overlapping_segments, rerank_candidates e get_most_relevant_parts_by_transcript. Na referência, avaliação e justificativas acompanham candidatos; validações seguintes fundamentam texto, timestamps e duração. Rerank compara/ordena candidatos e preserva a primeira ordem se falhar, sem um terceiro veto editorial por uma nota independente. Adaptado conceitualmente: uma avaliação por intervalo, fundamentação literal, correção antes do descarte e dedupe anterior a trabalho redundante. Nenhum código/prompt AGPL foi incorporado e nenhum serviço do laboratório foi iniciado.

Releitura e experiências locais após o aceite do parâmetro editorial, 2026-10-24: SupoClip coloca a transcrição timestampada diretamente no prompt (`build_transcript_analysis_prompt`); AutoClip serializa o payload em JSON compacto no provider (`_build_full_input`) e admite uma repetição com `previous_error` concreto. Não atribuir aos dois a mesma apresentação. O ajuste programático de duração do SupoClip não comprova fechamento semântico; o preenchimento `min_keep` do AutoClip não foi adotado. O pedido do mantenedor mantém a transcrição completa em uma entrada, sem portar as janelas/limites de quantidade das referências.

O prompt original do SupoClip foi executado apenas no laboratório com Qwen3.5-4B, fonte integral e regras originais de 15–60 s/2–5 propostas: ainda escolheu fragmentos e títulos em inglês, sem comprovar qualidade do fluxo desse projeto. Não é comparação ponta a ponta com o aplicativo SupoClip. O prompt AGPL permanece somente no diretório de teste ignorado, fora do produto. As instruções de produção são próprias. Trocar textos de prompt é calibração, não treinamento dos pesos.

Comparação autorizada Qwen3.5-4B/9B, mesmos 334 segmentos e contexto 32768: a proposta de aumentar o modelo foi rejeitada neste teste; seis propostas do 9B não corresponderam a seis intervalos corretos, e ambos aprovaram um controle com mudança de assunto. WorkingSet observado do processo: 3763,85/6596,05 MiB na descoberta; não é memória total do app. Registro rastreável em `docs/reports/evidence/qwen35-9b-comparacao-2026-10-24.json`. O 9B não foi promovido a padrão.

Complemento da releitura do AutoClip na mesma revisão: `backend/services/simple_pipeline_adapter.py` usa `clip_finder` em `clips_only`; no fluxo completo e no fallback seguem `step1_outline.py` → `step2_timeline.py` → `step3_scoring.py` → `step4_title.py`. Portanto, a descrição de uma chamada acima se refere ao caminho rápido, não a todo o aplicativo. A cadeia `studio/intelligence.py:text_json` → `LLMClient.call` → provider acrescenta instrução JSON e faz parsing; não foi encontrada imposição de um esquema completo de gramática nessa chamada. Isso é uma diferença concreta a testar, não prova de superioridade. Nosso protótipo de mapa e localização manteve a fonte inteira em cada solicitação: reconheceu assuntos, mas ainda escolheu bordas erradas. Localizar separadamente cada tópico, retirar a gramática e dar instruções em inglês também não comprovou a qualidade pretendida; nenhum desses protótipos foi integrado. Não portar os limites por janela, metas de quantidade ou preenchimento abaixo do piso das referências.

Aplicações adicionais verificáveis do estudo: a segunda descoberta recebe os motivos concretos das recusas e também atende uma coleção inicialmente vazia; reparos limitados podem preencher vagas mesmo quando já há um corte aprovado. O total de três reparos/job, o piso 50, a recusa por contexto/conclusão e as versões existentes são preservados. O teste de regressão de vagas falhou antes da correção e passou depois. Esses acertos de orquestração não demonstram que as propostas passaram a ser editorialmente boas.

Controle de backend: CPU e Vulkan ainda produziram erros de fatos/bordas com a mesma fonte. Um runtime oficial CUDA b11829 portátil, isolado e sem instalação global, executou a descoberta em 11,94 s, mas também fragmentou histórias e atribuiu fatos incorretamente; não foi promovido ao motor padrão. Relatos públicos de defeitos Vulkan em outros builds/hardware não comprovam um defeito neste ambiente. Não atribuir ao backend o problema editorial com base apenas nesses relatos.

Aplicação em validação: referências inequívocas L000 etc. para as falas, sem pedir ao modelo que calcule tempos ou copie longas citações; timestamps e texto reconstruídos da fonte. A conferência literal anterior descartou quatro de cinco propostas no ensaio fresco de 23,58 s, antes da avaliação editorial. Histórico de busca agora inclui também as versões excluídas/rejeitadas que o dedupe já conhecia; teste reproduziu a omissão e passou após a correção. Isso não ressuscita excluídos nem bloqueia todos os outros momentos da região. Uma proposta fundamentada ainda precisa de avaliação do intervalo real; nota e quantidade do modelo não substituem o parâmetro aprovado pelo mantenedor.

Verificação adicional do runtime: o [teste oficial do llama.cpp para ordem das propriedades](https://github.com/ggml-org/llama.cpp/blob/master/tests/test-json-schema-to-grammar.cpp) demonstra que a gramática fixa a ordem recebida. O nosso serde_json ordenava chaves alfabeticamente: os arquivos reais começavam por closing, antes de summary/title. A feature preserve_order da dependência já existente preserva a ordem declarada do esquema, e os critérios passam a emitir evidência/explicação antes da nota. Um teste reproduziu a ordem antiga antes da correção. A melhoria editorial ainda exige testes do modelo; ordem correta do JSON, sozinha, não é aceite de qualidade.

YuNet é detector de rostos/landmarks, não identificador de pessoas. A referência compara a região da boca entre duas imagens separadas por 0,25 s e, sem movimento suficiente, usa o maior rosto. Seu módulo também gera trilhas por plano e alterna crop/fit. Nesta fatia foi adaptada apenas a detecção, a estimativa de falante e o centro estático seguro: no máximo 12 pares por corte, largura 480 px, OpenCV CPU com uma thread, leitura limitada aos novos 9:16 em cover. Mudança de posição/falante ou ambiguidade incompatível com um recorte fixo resulta em quadro inteiro; sem rostos mantém a escolha existente. Não é tracking animado por tempo nem associação voz-identidade. Edição manual salva sempre prevalece.

Modelo YuNet 2023mar copiado da revisão estudada, 232.589 bytes, SHA-256 `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`, com licença MIT de Shiqi Yu preservada em `resources/models/YUNET-LICENSE.txt`. Worker próprio e requisitos fixados em `tools/face-framing`; OpenCV 4.12.0.88 e NumPy 2.2.6 ficam em ambiente isolado ignorado, sem mudar o ASR. Não copiar o instalador automático, os espelhos pip, o purge global de NumPy ou o framework Python inteiro do AutoClip. Execução no app não baixa nada nem usa rede; componente ausente é explicitamente marcado no clipe.

Fontes oficiais conferidas: [API FaceDetectorYN](https://docs.opencv.org/4.x/df/d20/classcv_1_1FaceDetectorYN.html), [modelo/licença](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) e [pacote headless](https://pypi.org/project/opencv-python-headless/4.12.0.88/). Evidências delimitadas desta adaptação ficam em `docs/reports/evidence/autoclip-prompts-rostos-2026-10-24/`; aceite editorial e teste da interface pertencem ao mantenedor.

O mantenedor solicitou estudo completo do código e comparação local, após rejeitar a edição demonstrativa e relatar regressões. Esta entrada registra a preparação do objetivo, não a execução do estudo.

- Principal: [zhouxiaoka/autoclip](https://github.com/zhouxiaoka/autoclip), página e árvore backend consultadas. Complementar: [artbyjazi/autoclip](https://github.com/artbyjazi/autoclip). São projetos diferentes; não misturar implementações.
- Nenhum commit externo fixado nesta preparação; o endpoint de commits via navegador não ficou acessível. O ZCode deverá registrar SHA completo e separar release/main antes de ler/adaptar código.
- O resumo enviado por outro ChatGPT é um conjunto de hipóteses a verificar (inclusive caminhos, modelos, tracking e limites), não prova de leitura de fonte, funcionamento ou qualidade. Nenhum AutoClip foi instalado/executado aqui.
- Estudo futuro: leitura integral de código autoral e testes/prompts/scripts, cobertura por arquivo, call graph e contratos; licença de código/modelos/dependências; execução local isolada e comparação de pipeline/modelos sob condições equivalentes. Não transpor benchmarks de API em nuvem para 4B/12B locais.
- Goal canônico preparado: `docs/reports/evidence/goal-recuperacao-autoclip-2026-10-23/prompt-goal-zcode.txt`. O arquivo e a mensagem devem ter conteúdo idêntico. Resultados de pesquisa/decisões posteriores atualizam este documento incrementalmente.

## Situação atual e limite deste estudo — revisão 03N

A comparação original abaixo é pesquisa documental datada, não prova de que os fluxos dos aplicativos foram estudados de ponta a ponta ou adaptados. Houve leituras parciais e falhas de consulta já descritas em Fontes e limites. Não existe neste registro um mapeamento completo por revisão/arquivo/função que demonstre adoção de SupoClip, ViralMint, OpenClipper ou OpenCut. Não declarar essa adoção nem deduzir funcionamento apenas de README/estrelas.

Estado do nosso código após 03M: FFmpeg/ffprobe, whisper.cpp e Qwen3-4B textual já estão integrados por subprocessos; importação é persistente e render real existe. faster-whisper/Qwen3-ASR/Parakeet tiveram avaliações registradas, sem serem opções completas do pipeline do produto. As recomendações de “primeiro implementar transcrição/exportação” abaixo são históricas. A preferência atual por Turbo e retirada de Large completo consta na DEC-014; qualidade editorial e preenchimento 9:16 seguem defeitos abertos.

### Estudo obrigatório antes da próxima implementação

Usar os repositórios já listados, sem substituir a stack do CutNicePro. Para cada capacidade, registrar neste documento existente: URL e revisão efetivamente lida, caminhos/funções, contrato de entrada/saída, etapas/modelos, estados de erro/cancelamento/retomada, dependências/licenças, testes observados e adaptação escolhida. Explicar diferenças relevantes; não transpor uma infraestrutura de servidor/Docker para desktop por semelhança de tela. Falha de acesso é PENDING/BLOCKED, não evidência de comportamento. Esta tarefa documental não executa nem simula esse estudo técnico.

| Referência já indicada | Fluxos a estudar no código | Evidência de adaptação completa hoje |
|---|---|---|
| SupoClip | Seleção/contexto dos trechos, composição vertical e legendas | Não documentada; pendente |
| ViralMint | Encadeamento de etapas, jobs/falhas, timeline e render | Não documentada; pendente |
| OpenClipper | Contratos Tauri/Rust/React, ASR, enquadramento e exportação | Leitura anterior de Cargo.toml não comprova estudo desses fluxos |
| OpenCut / opencut-classic | Organização do editor, mídia e histórico | Não documentada; verificar a revisão adequada antes de adotar |

Esses focos são tarefas de investigação, não funcionalidades confirmadas por novo teste desses projetos. Manter as ressalvas de licença e as fontes históricas abaixo. Não atualizar estrelas/versões sem nova consulta, nem remover referências porque não foram usadas.

## Decisão proposta na pesquisa original — histórico

FFmpeg continua responsável por análise/transformação/render. Avaliar whisper.cpp como primeiro transcritor local e faster-whisper como alternativa medida, sem instalar ambos de início. Quando autorizada a importação real de links, integrar yt-dlp como etapa anterior ao mesmo armazenamento de mídia local. Aplicações completas servem para estudar contratos, jobs e experiência; não substituem automaticamente o projeto existente.

As estrelas abaixo são valores arredondados exibidos nas páginas consultadas, não medição de crescimento nem certificação de qualidade. Funcionalidades descritas são do código/documentação pública consultados; nenhum desses aplicativos foi instalado ou validado nesta pesquisa. Resultados de benchmarks dos autores não equivalem a desempenho na máquina do mantenedor.

## Aplicações completas para referência

| Repositório | Adoção observada / licença declarada | Contribuição para nosso projeto | Limite para adoção |
| --- | --- | --- | --- |
| [SupoClip](https://github.com/FujiwaraChoki/supoclip) | ~1,5 mil estrelas; AGPL-3.0 | Referência de seleção de momentos, enquadramento e legendas. | Setup rápido usa Docker e AssemblyAI; há documentação de modo local. Não adotar como motor local pronto sem avaliar esse caminho. |
| [ViralMint](https://github.com/openclaw-easy/ViralMint) | 167 estrelas; AGPL-3.0 | Referência de integração download → transcrição → timeline → export, incluindo FFmpeg/ASS e BYOK. | Plataforma ampla com FastAPI/React e vários serviços; reproduzir tudo ampliaria o escopo. Alegações de testes do README não foram executadas aqui. |
| [OpenClipper](https://github.com/GrepCut/OpenClipper) | 10 estrelas; MIT | Candidato mais próximo da stack: Tauri, React e Rust; documentação de ASR, enquadramento e export em Windows. Cargo.toml também consultado. | Pouca adoção pública. Proximidade técnica não comprova maturidade; estudar módulos e testes antes de reutilizar. |
| [OpenCut](https://github.com/OpenCut-app/OpenCut) | ~95,3 mil estrelas; MIT | Referência para editor, timeline e organização de mídia. | Main está em reescrita; o próprio projeto direciona o uso atual para [opencut-classic](https://github.com/OpenCut-app/opencut-classic). Não basear nosso motor num core em reconstrução. |

Minha avaliação: OpenClipper é o mais parecido com a arquitetura atual, enquanto SupoClip tem mais adoção que ele. Nenhum dos dois é automaticamente a melhor dependência para o MVP. Adoção de editor completo exigiria mudanças muito maiores que plugar transcrição e render.

## Motores e ferramentas especializados

| Repositório | Adoção observada / licença do repositório | Uso possível | Prioridade proposta |
| --- | --- | --- | --- |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | ~54,5 mil; MIT | Transcrição local em C/C++, executável separado e suporte a processamento CPU. | Primeira avaliação para M3; medir fala pt-BR e memória antes de fixar modelo. |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | ~26 mil; MIT | Transcrição com CTranslate2, CPU int8/GPU e timestamps. | Alternativa ao primeiro candidato; exige considerar distribuição do runtime Python e dependências. Não presumir vencedor por benchmarks diferentes. |
| [WhisperX](https://github.com/m-bain/whisperX) | ~24,7 mil; BSD-2-Clause | Alinhamento por palavra e identificação de falantes. | Depois da primeira transcrição; inclui dependências/modelos adicionais. Diarização tem condições próprias e não é requisito do primeiro ciclo. |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | ~199,3 mil; Unlicense no repositório | Obter mídia de link com metadados, progresso e integração posterior ao armazenamento local. | Quando a etapa YouTube for executada; considerar os requisitos de runtime JavaScript documentados e o build distribuído. |
| [Auto-Editor](https://github.com/WyattBlue/auto-editor) | ~5,6 mil; Unlicense | Cortes automáticos por análise, especialmente pausas/silêncio. | Posterior; não equivale a encontrar momentos semanticamente interessantes. |
| [PySceneDetect](https://github.com/Breakthrough/PySceneDetect) | ~5,3 mil; BSD-3-Clause | Detectar mudanças de cena e ajudar a evitar cortes visuais ruins. | Posterior; não identifica sozinho o valor de um trecho nem rastreia falantes. |

Sinais concretos de manutenção consultados: whisper.cpp releases com v1.9.5 marcada Latest, publicada em 6 de outubro; faster-whisper lista 1.2.1 como Latest; yt-dlp lista 2026.08.19; PySceneDetect documenta 0.7.2 em 11 de outubro de 2026. Não foi obtido histórico de crescimento de estrelas. API de commits do OpenClipper não respondeu nesta consulta, portanto não há conclusão sobre frequência recente de commits dele.

## Como avançar sem reiniciar o projeto — sequência histórica da pesquisa

1. Fechar a validação pendente das correções da entrada M2A, conforme orçamento autorizado. Diferenciar o erro do harness dos defeitos do produto.
2. Implementar uma transcrição local real de vídeo persistido, com adaptador isolado, idioma/timestamps, cancelamento, persistência e recuperação. Confirmar flags no executável selecionado, sem copiar exemplos incompatíveis de outros planos.
3. Exportar um trecho MP4 real com FFmpeg, inicialmente sem efeitos avançados; depois aplicar legendas ASS/SRT com os tempos da transcrição. Fonte, modelo e tempo do preview precisam corresponder ao arquivo exportado.
4. Integrar download real de YouTube via adaptador próprio, quando autorizado: URL → job → arquivo validado → armazenamento de mídia existente. Não usar iframe como prova de importação. Requer critérios para erros da origem, cancelamento e retomada/retry; sem automatizar credenciais do navegador.
5. Só então acrescentar seleção semântica de melhores momentos e reenquadramento. Auto-Editor e PySceneDetect resolvem partes diferentes desse problema; não representam um motor de viralidade pronto.

Aceite do primeiro ciclo: importar um arquivo, reiniciar/reabrir, transcrever fala em português, buscar e navegar na transcrição, escolher legendas e exportar um MP4 reproduzível. Um resultado real por fatia vale mais que instalar vários aplicativos de referência.

## Licença e procedência

SupoClip e ViralMint declaram AGPL-3.0; MIT/BSD/Unlicense também têm condições que precisam ser verificadas na versão escolhida. Não copiar código antes de registrar origem, versão/commit, licença e adequação à distribuição planejada. Conferir separadamente dependências, binários, modelos, fontes e outros assets. Não concluir compatibilidade comercial apenas pelo rótulo open source. A licença do repositório yt-dlp ou Auto-Editor não descreve sozinha todas as licenças dos executáveis empacotados.

## Fontes e limites

Fontes principais: links de cada linha da tabela, READMEs e páginas de releases oficiais. Consultado adicionalmente: [OpenClipper Cargo.toml](https://raw.githubusercontent.com/GrepCut/OpenClipper/master/src-tauri/Cargo.toml), [whisper.cpp releases](https://github.com/ggml-org/whisper.cpp/releases), [faster-whisper releases](https://github.com/SYSTRAN/faster-whisper/releases), [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases). Algumas leituras de arquivos individuais de SupoClip/ViralMint e API de commits falharam; avaliações desses casos permanecem documentais. Esta comparação não é auditoria de segurança nem teste de desempenho ou qualidade dos aplicativos.


## Timeline e vídeos longos — estudo de módulos, 2026-10-22

### Escopo, evidências e conclusão

Pesquisa solicitada pelo mantenedor para orientar o ZCode, sem implementar correções. Foram lidos 17 arquivos em quatro repositórios, em revisões fixadas, além de documentação oficial. Inventário com URLs, revisões, linhas e SHA-256: `docs/reports/evidence/timeline-research-2026-10-22/sources.json`. Prompt: `prompt-zcode.txt` no mesmo diretório.

Os aplicativos externos não foram instalados nem comparados em benchmark. Nenhum teste deles foi executado. O estudo de módulos abaixo não transforma os catálogos históricos acima em revisão completa de outros projetos. Não existe evidência pública suficiente aqui para descrever a arquitetura interna do editor do OpusClip.

A melhor sequência proposta para a stack atual é corrigir leitura parcial de mídia, autoridade do tempo solicitado e trabalho de UI por frame; medir o custo residual de decodificação e, se necessário, acrescentar proxy de edição com FFmpeg. Proxies não corrigem uma resposta Range que lê o arquivo inteiro, e limitar renders não corrige disputa entre eventos de tempo. Nenhum desses fatores deve ser apontado como causa única dos picos sem medição.

### 1. Tauri — protocolo de mídia por intervalos

- Origem: [tauri-apps/tauri](https://github.com/tauri-apps/tauri), revisão `ba1e205f3bfba19a9cbe6032bb4ece3068429d04` (branch dev consultada; não é proposta de upgrade).
- Arquivos: `examples/streaming/main.rs` e `crates/tauri/src/protocol/asset.rs`.
- Fluxo efetivamente estudado: handler recebe URI/método/Range; abre arquivo, usa metadados e interpreta intervalos. No ramo de intervalo único, limita o comprimento a `1000 * 1024`, faz seek no arquivo e lê com `take(nbytes).read_to_end`. Produz 206 com Content-Range/Content-Length; intervalo não satisfazível produz 416. O limite é por trecho, não orçamento total de concorrência.
- Contrato: arquivo autorizado + intervalo em bytes -> corpo parcial + cabeçalhos coerentes. Entradas sem Range e múltiplos intervalos seguem ramos distintos; HEAD e erros precisam ser examinados separadamente.
- Ressalva importante: o ramo sem Range em `asset.rs` ainda lê o arquivo inteiro. Multipart também não demonstra limite agregado global. Não copiar o handler como garantia de memória limitada para todos os casos; aplicar semântica da RFC e orçamento explícito.
- Dependências relevantes: std::fs/File, Read/Seek, HTTP, http_range e infer. MIT OU Apache-2.0 nos arquivos consultados; verificar compatibilidade com a versão instalada, sem introduzir dependência só por reproduzir o exemplo.
- Testes observados: `multi_range_request` verifica estrutura da resposta multipart; `empty_path_request` verifica rejeição de caminho. Nenhum executado; não são prova de estabilidade de RAM.
- Adaptação proposta: substituir leitura integral + cópia do `cnplocal` por leitura parcial limitada, mantendo autorização de caminhos e protocolo do app. Testar bytes efetivamente lidos, HEAD, suffix/open ranges, arquivo vazio, erros e concorrência. Comportamento sem Range deve ser eficiente e correto, nunca 200 truncado.

Fonte: [handler asset fixado](https://github.com/tauri-apps/tauri/blob/ba1e205f3bfba19a9cbe6032bb4ece3068429d04/crates/tauri/src/protocol/asset.rs), [RFC 9110 — Range](https://www.rfc-editor.org/rfc/rfc9110.html#name-range).

### 2. OpenCut Classic — playback, playhead e cache de vídeo

- Origem: [OpenCut-app/opencut-classic](https://github.com/OpenCut-app/opencut-classic), revisão `cf5e79e919144200294fb9fed22a222592a0aeea`. Repositório arquivado: referência histórica delimitada, não dependência recomendada para instalar.
- Arquivos centrais: `apps/web/src/core/managers/playback-manager.ts`; `apps/web/src/timeline/controllers/playhead-controller.ts`; `apps/web/src/timeline/hooks/use-timeline-playhead.ts`; `apps/web/src/timeline/components/timeline-playhead.tsx`; `apps/web/src/services/video-cache/service.ts`.
- Complementos lidos: `apps/web/package.json`, `LICENSE` e `services/renderer/nodes/video-node.ts`. Este último é uma classe pequena sem pipeline implementado suficiente para fundamentar conclusões de render.
- PlaybackManager separa listeners de estado, atualização de tempo e seek. Mantém isPlaying/currentTime/isScrubbing e âncora temporal da reprodução. PlayheadController mantém sessão de scrub e última posição; `updatePlayheadLeft` altera diretamente o estilo do elemento. Não obriga toda a árvore React a renderizar a cada atualização do playhead. Hook mantém controller/config e remove inscrições no teardown.
- Contrato: atualizações do relógio de reprodução e interação -> posição visual e eventos de seek. A separação de responsabilidades é aproveitável; não foi demonstrado que implementa exatamente o protocolo de confirmação solicitado/confirmado necessário ao nosso HTMLVideoElement.
- VideoCache recebe mídia/tempo e retorna frame. Deduplica inicialização por Promise; usa geração para descartar solicitações enfileiradas obsoletas; serializa trabalho em frameChain. Mantém frame atual/próximo e CanvasSink com poolSize 3. Busca local para avanço curto e reposiciona iterator para saltos/reversão.
- Limites: geração descarta trabalho obsoleto ainda enfileirado, não prova cancelamento do decoder já ativo. Pool de três canvases por sink não limita toda a RAM do editor; mapa de sinks não apresenta LRU global nesse arquivo. Dispose/clearVideo/clearAll liberam recursos explicitamente.
- Dependências observadas: aplicação Next/React, Mediabunny ^1.29.1 e opencut-wasm ^0.2.10, entre outras. Não são substituição direta do Tauri/HTMLVideoElement. Licença MIT no LICENSE lido; dependências e binários exigem avaliação própria antes de adoção.
- Testes: busca na árvore consultada não identificou testes específicos pelos nomes playback/playhead/video-cache; isso não prova ausência de testes no projeto inteiro. Nenhum executado.
- Adaptação proposta: separar reprodução, intenção de seek e posição visual; reduzir o caminho quente do playhead e descartar trabalho obsoleto. Implementar primeiro no adaptador atual; não instalar Mediabunny automaticamente.
- **Adoção registrada (2026-10-22, tarefa timeline):** o mecanismo do VideoCache
  (geração p/ descartar pedidos obsoletos, frameChain serializado, frame
  atual/próximo, busca sequencial p/ avanço curto e reposicionamento do iterator
  em saltos) foi adaptado em `app/src/lib/frame-seeker.ts` com a dependência
  `mediabunny` ^1.62.1 (MIT — mesma família usada pelo OpenCut Classic ^1.29.1;
  wrappers WebCodecs/demuxer). Motivação: o `<video>` decoda do keyframe até o
  alvo em H.264 1080p; o FrameSeeker decoda só o frame alvo para a prévia do
  scrub (overlay), mantendo o `<video>` como autoridade de playback/áudio.
  Justificativa e medidas no relatório da tarefa timeline
  (`docs/reports/history/`, 2026-10-22) e evidência
  `docs/reports/evidence/goal-timeline-2026-10-22/`.

Fontes: [PlayheadController](https://github.com/OpenCut-app/opencut-classic/blob/cf5e79e919144200294fb9fed22a222592a0aeea/apps/web/src/timeline/controllers/playhead-controller.ts), [VideoCache](https://github.com/OpenCut-app/opencut-classic/blob/cf5e79e919144200294fb9fed22a222592a0aeea/apps/web/src/services/video-cache/service.ts).

### 2b. AutoClip (zhouxiaoka) e AutoClip (artbyjazi) — pipeline de cortes, fronteiras e enquadramento (2026-10-23)

Origem: zhouxiaoka/autoclip rev `3d3b5edf9ffa595a764b0919e6dbd4ce8acaca84`
(2026-10-22, tag mcp-v1.5.7) e artbyjazi/autoclip rev `5d0eac36fa615b79dd2104083bf273a96f8d68bb`
(2026-08-01), ambos MIT; clones isolados em `.tooling/vendor/refs-autoclip/`.
Cobertura por arquivo, lacunas declaradas e matriz por capacidade:
`docs/reports/evidence/goal-recuperacao-autoclip-2026-10-23/g4-estudo-autoclip.md`
e `g5-matriz-comparacao.md`. Nenhum código foi EXECUTADO (estudo estático).

- Seleção: one-pass com janelas sobrepostas (zhou: 60 min/70 k chars nuvem,
  20 min/12 k chars local; payload compacto `id|tempo|texto`, ~40 % menos
  tokens que SRT); legado 6 passos como fallback; jazi: 8 min/60 s com
  concorrência local=1 (GPU saturada). Qualidade programática determinística
  (zhou `quality.py`): snap de fronteiras a cues, merge por sobreposição,
  clamp de duração por tier, seleção threshold 0,7 + min_keep/max_clips,
  fallback SEMPRE marcado. Fronteiras por frase+pausa (`boundaries.py` de
  ambos; jazi alinha cortes a silêncio medido). Drop de pergunta final que
  pertence ao próximo tópico (zhou).
- Enquadramento 9:16 por plano: zhou = YuNet ONNX (MIT) + boca-que-se-move =
  falante, sem rosto → fit com fundo borrado; jazi = landmarks + tracks +
  diarização ("never jarring", biased to stillness). Ambos superam nossa
  prova de conceito M4 (centro único), que permanece FORA do caminho padrão.
- ASR: faster-whisper sob demanda com progresso por segmento; LLM:
  cloud-first com presets Ollama/LM Studio (zhou) vs local-first (jazi).
  Cancelamento maduro no zhou (bind/checkpoint + limpeza pós-delete).
- Adaptações registradas para o CutNicePro (propostas, ainda não
  implementadas): payload compacto de seleção, refine determinístico de
  fronteiras (frase+pausa; insumos já existem — word-level do Whisper +
  silencedetect), reuso do modelo via server sem mmproj (exige ganho medido).

### 3. Kdenlive — cache limitado e proxy em background

- Origem: [KDE/kdenlive](https://github.com/KDE/kdenlive), revisão `80b74ffa95390f4cc8d75a4e886e7ff47373583e`.
- Arquivos: `src/utils/thumbnailcache.cpp`, `src/jobs/proxytask.cpp`, `src/jobs/proxytask.h`, `src/monitor/monitorproxy.cpp` e `src/monitor/monitorproxy.h`. Leitura do monitor foi complementar; não se afirma equivalência entre sua sincronização MLT e nosso elemento de vídeo.
- ThumbnailCache: estrutura indexada por chave e lista; get move o item para a frente, insert rejeita item maior que orçamento e remove itens do fim enquanto excede custo. Inserção de QImage usa sizeInBytes. O cache volátil é construído com custo máximo 10000000; isso não representa teto de RAM de todo Kdenlive.
- Contrato: chave -> imagem cacheada, com custo contabilizado; armazenamento volátil e em disco são capacidades separadas. Adaptar orçamento proporcional, não o número literal como garantia geral.
- ProxyTask::start deduplica job pendente por owner/tipo. run identifica original e destino separados, considera cache existente, executa processo e acompanha progresso. Cancelamento encerra processo próprio; falha/arquivo vazio não publica proxy como sucesso. Troca de produtor ocorre após sucesso. Perfis e fallback de hardware são específicos do projeto.
- Contrato: mídia original + perfil -> derivado leve para edição. Original permanece ativo do usuário e é referência para render final, conforme documentação oficial.
- Dependências: Qt/MLT/Kdenlive job infrastructure e FFmpeg. Não portar essa arquitetura para o CutNicePro.
- Licença nos arquivos: GPL-3.0-only OU LicenseRef-KDE-Accepted-GPL. Usar como referência conceitual e implementar solução própria; não autoriza cópia indiscriminada para outro produto.
- Testes: árvore apresenta diálogo proxytest e dataset missing-proxy; não foram estudados como testes automatizados do comportamento nem executados. Fluxos de erro/cancelamento acima vêm do código do job.
- Adaptação proposta: job de proxy cancelável/deduplicado, cache com chave de fonte/perfil, validação e publicação atômica; preview pelo proxy e export pelo original. Definir política de descarte e espaço em disco. Medir perfil/resolução/GOP para a mídia e hardware reais.

Fontes: [ThumbnailCache](https://github.com/KDE/kdenlive/blob/80b74ffa95390f4cc8d75a4e886e7ff47373583e/src/utils/thumbnailcache.cpp), [ProxyTask](https://github.com/KDE/kdenlive/blob/80b74ffa95390f4cc8d75a4e886e7ff47373583e/src/jobs/proxytask.cpp), [documentação de proxies](https://docs.kdenlive.org/en/project_and_asset_management/project_settings/proxy_settings.html), [categorias de cache](https://docs.kdenlive.org/en/project_and_asset_management/project_settings/tab_cache_data.html).

### 4. Remotion Player e alternativas de decode

- Origem: [remotion-dev/remotion](https://github.com/remotion-dev/remotion), revisão `3ab34665c49279cc35820275380983068bb1bbf9`.
- Arquivos: `packages/player/src/Player.tsx` e `LICENSE.md`.
- Player.tsx mantém frame em estado/ref e stores separados de reprodução/buffering; passa setFrame e setFrameWithoutSeek por contextos. Estudo restrito ao componente de composição do Player, sem auditar hooks/decoder de ponta a ponta.
- Contrato observado: configuração/composição -> Player com contextos de frame, reprodução, buffering e controles. Não prova performance de scrub na máquina do mantenedor.
- Dependência de ecossistema Remotion/React; licença própria, com condições e restrições de redistribuição de código. Referência conceitual, sem proposta de copiar código ou adicionar Remotion ao produto.
- Consulta da árvore completa falhou no conector (Transport closed); arquivos individuais foram lidos em seguida. Nenhum teste executado.
- Documentação de playback alerta para custo de prefetch/premount excessivo; não assumir que carregar mais frames sempre melhora fluidez.
- Mediabunny documenta leituras sob demanda e descarte explícito de Input/VideoSample; pool de CanvasSink e VideoFrame.close ajudam a controlar recursos, mas exigem gerenciamento de ciclo de vida e compatibilidade. São alternativa futura a comparar, não migração aprovada.

Fontes: [Player fixado](https://github.com/remotion-dev/remotion/blob/3ab34665c49279cc35820275380983068bb1bbf9/packages/player/src/Player.tsx), [playback issues](https://www.remotion.dev/docs/player/playback-issues), [leitura de mídia](https://mediabunny.dev/guide/reading-media-files), [media sinks](https://mediabunny.dev/guide/media-sinks), [VideoFrame.close](https://developer.mozilla.org/en-US/docs/Web/API/VideoFrame/close).

### Cruzamento com o CutNicePro e aceite proposto

Diagnóstico estático anterior: `docs/reports/evidence/timeline-static-2026-10-22/analysis.txt`. Caminhos principais: `local_media_scheme.rs`, `VideoEditor.tsx`, `VideoPreview.tsx`, `TimelineSurface.tsx`, `TranscriptPanel.tsx`.

1. I/O: leitura completa por requisição antes de Range é defeito estrutural verificável; contribuição quantitativa aos picos exige runtime.
2. Tempo: alvo solicitado e eventos intermediários compartilham estado; hipótese forte para o snapback, sem trace que prove sequência exata.
3. Render: debounce não equivale a throttle nem impede render da árvore por outros props/callbacks; não há ganho de 8,5x demonstrado.
4. Decode: avaliar depois dos três anteriores. O módulo chamado media_proxy no app controla acesso a arquivos de cache, não é proxy de edição transcodificado.

Critérios propostos, não resultados: playhead p95 <=50 ms; prévia com proxy pronto p95 <=250 ms no hardware identificado; sem snapback; ausência de crescimento monotônico entre ciclos delimitados. Precisão temporal segundo FPS/timebase e preservação da mídia/exportação. Memória deve ser medida no conjunto de processos do app e WebView2, separando buffers, React e decoder quando possível. Duração do vídeo não deve exigir carregar todos os frames; tamanho, codec, GOP e quantidade de elementos afetam custos distintos.

Teste runtime: build identificado sem HMR, vídeo de 24 min e de 2 h quando disponível; origem sintética explicitada; baseline, scrub e repouso; orçamento seguro antes de iniciar. Sem execução real, correção continua PARTIAL/BLOCKED. Aprovação estética continua humana.

Documentação adicional: [WebView2 performance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance), [React external store](https://react.dev/reference/react/useSyncExternalStore). Nenhuma dessas fontes comprova por si só o desempenho do CutNicePro.


### Direcionamento adicional — rastrear o fluxo completo do OpenCut (2026-10-22)

- Pedido do mantenedor: o ZCode deve estudar o editor e suas dependências até o frame apresentado, comparar todo o caminho de mídia com CutNicePro e implementar correções com runtime. O estudo delimitado anterior não constitui essa auditoria completa.
- Nova conferência: README de OpenCut em `e668010778568641babef2cc40be4703ae6916d6` informa que opencut.app usa Classic; a reescrita com núcleo Rust usa new.opencut.app. SHA exato do deploy não identificado. Classic consultado permanece `cf5e79e919144200294fb9fed22a222592a0aeea`; package.json lista Next/React/Mediabunny/opencut-wasm. Isso não prova quais dependências executam cada etapa.
- Prompt `docs/reports/evidence/opencut-fluxo-completo-2026-10-22/prompt-zcode.txt`: mapear rota/importação, relógios, eventos, decode/composição, cache, recursos e cleanup; seguir implementações herdadas e dependências resolvidas pelo lock; produzir matriz comparativa; medir a mesma mídia com latência de playhead separada da prévia.
- A fluidez relatada no OpenCut vem do mantenedor. Nenhum dos dois aplicativos foi executado nesta tarefa. Correções do relatório ZCode 1500 não foram auditadas novamente aqui. Não concluir equivalência de stack nem atribuir desempenho a Rust/servidores sem caminho de execução.
- Fontes conferidas e hashes em sources.json na mesma pasta. Sem alteração de aplicativo, dependências, versão ou index. Próximo passo: executar o prompt no ZCode com os critérios de rastreio completo e validação real.


### Revisão do relato “Blob URL resolve o gargalo” — 2026-10-22

O código atual foi conferido: useWorkspaceData faz fetch(schemeUrl).blob() antes de criar a URL; Rust ainda lê o arquivo integral no caminho sem Range, usa intervalo aberto sem teto e ignora múltiplos ranges com retorno 200 completo. O relatório chamar isso de “rejeição” não corresponde a esse ramo. O custo real da aquisição/memória não foi medido.

Object URL é uma referência à fonte, não especificação de demux/decode/render. OpenCut Classic mantém VideoCache com Input/BlobSource/CanvasSink, geração/serialização de pedidos e pool; a cadeia completa até o frame apresentado deve ser rastreada. A presença de object URLs nos dois apps não prova equivalência.

Documentação consultada: [createObjectURL](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static), [File](https://developer.mozilla.org/en-US/docs/Web/API/File), [Response.blob](https://developer.mozilla.org/en-US/docs/Web/API/Response/blob). Response.blob lê a resposta até o fim; não concluir que todos os bytes permanecem necessariamente em RAM, pois o backing store exige medição.

Detalhes e limites em `docs/reports/evidence/revisao-blob-timeline-2026-10-22/analysis.txt`. Novo prompt pede experimento controlado: OpenCut, vídeo mínimo no WebView2 com a mesma fonte e editor completo, antes de outra correção. Nenhum benchmark/correção nesta revisão.

### Preparação de integração multimodal — 2026-10-23

Leitura preparatória, sem execução de modelo ou adoção de dependências. Inventário e hashes em `docs/reports/evidence/goal-cortes-multimodais-2026-10-23/sources.json`; direcionamento completo no `objetivo-zcode.txt` dessa pasta.

- **Gemma:** o [model card oficial](https://ai.google.dev/gemma/docs/core/model_card_4) não comprova suporte do backend instalado. No CutNicePro, `clips/text_engine.rs::generate_with` recebe texto e schema, usa `-f/-jf` e contexto 8192. A primeira etapa proposta é verificar entradas visuais/sonoras reais no runtime.
- **llama.cpp:** [README de mtmd](https://github.com/ggml-org/llama.cpp/blob/master/tools/mtmd/README.md) descreve a infraestrutura multimodal; componentes dependem da arquitetura. Compatibilidade do artefato Gemma instalado ainda não verificada. Não deduzir suporte apenas pelo nome do modelo.
- **ByteTrack:** leitura delimitada de [byte_tracker.py](https://github.com/FoundationVision/ByteTrack/blob/main/yolox/tracker/byte_tracker.py): `BYTETracker.update(output_results, img_info, img_size)` recebe detecções e faz associação temporal; `STrack` utiliza Kalman. Não é detector ou associação de falante. [LICENSE](https://github.com/FoundationVision/ByteTrack/blob/main/LICENSE) consultado é MIT; pesos e dependências precisam de avaliação própria. Referência candidata, sem decisão de instalação.
- **OpusClip:** [ClipAnything](https://www.opus.pro/clipanything) é referência de comportamento solicitado. Sua página pública não demonstra arquitetura interna, custo de processamento ou desempenho comparável.
- **Aplicação:** `clips/scene_regions.rs` refina bordas por transições FFmpeg; isso não demonstra tracking. `clips/types.rs` e `EditorTimeline.tsx` consultados representam intervalo/trim; plano com múltiplos intervalos exige rastreio adicional pelo implementador.

Branches externos consultados são móveis; hashes do conteúdo constam no inventário. Antes de adaptar código, o ZCode deve fixar revisões, seguir dependências relevantes e validar licença/contratos/testes. Não se afirma estudo completo ou integração destas referências.
