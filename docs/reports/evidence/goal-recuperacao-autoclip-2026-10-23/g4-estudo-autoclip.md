# G4 — Estudo do AutoClip (zhouxiaoka) — Cobertura por arquivo (rev 3d3b5ed)

**Cópia isolada**: `.tooling/vendor/refs-autoclip/autoclip-main` — clone limpo,
commit completo fixado: `3d3b5edf9ffa595a764b0919e6dbd4ce8acaca84`
(2026-10-22 17:26 +0800, "Merge PR #476", tag estável mais próxima
`mcp-v1.5.7`; SEM checkout de tag — o main é a revisão estudada e a tag
é o release de referência). Licença: **MIT** (backend, incluindo YuNet
ONNX que o framing.py declara MIT).

**Inventário da árvore** (excl. .git): 1.315 arquivos, 61 MB totais;
496 .py (437 em backend/, ~98 mil linhas); frontend/ 4 MB (web);
src-tauri (desktop Tauri + Python embutido); backend/assets/models (ONNX
YuNet); artifacts/ 75 KB (amostras). Categorias: aplicação = backend/ +
frontend/ + src-tauri/; testes = backend/tests (164 .py) + benchmarks/;
docs/ e design/; dependências vendorizadas = assets/models + dump.rdb
(artefato de execução, não código). Volumes conferidos com find/du.

**Estado**: LIDO/COMPREENDIDO abaixo; EXECUTADO = nenhum (decisão: rede/
telemetria controlados — nenhum instalador/script do repo foi rodado; o
estudo é estático + testes lidos; nota registrada em CONTINUIDADE).

## Leitura integral (LIDO = arquivo inteiro, COMPREENDIDO = função a função)

| Arquivo | Linhas | Papel | Funções/classes-chave | Entradas/Saídas | Erros | Testes ligados |
|---|---|---|---|---|---|---|
| `backend/pipeline/clip_finder.py` | 225 | **Descoberta em UMA passada** (substitui steps 1-4 p/ modelos grandes) | `find_clips`, `windows` (60min/70k chars nuvem; **LOCAL 20min/12k chars p/ Ollama/LM Studio**), `_parse` (valida ids/janela/duração ±50/150%, título chinês), `_dedupe` (overlap>0.5 do menor), `window_size()` (detecta modelo local via llm_manager) | SRT entries + `call(prompt,payload)` → formato legado step4_titles (compat!) | `ClipFinderError` p/ fallback ao pipeline legado; 1 retry por janela com `previous_error` no payload | test_clip_finder.py, test_clip_finder_local_windows.py |
| `backend/services/studio/framing.py` | 569 | **Enquadramento portrait por plano** | `detect_cuts` (ffmpeg scene>0.3), `split_shots` (min 0.4s, máx 120), `sample_offsets` (longas 2.5s), `_grab_pair` (2 frames 0.25s), `_speaker_center` (**YuNet ONNX + boca que mais se move = falante**; sem rosto→`fit` blur backdrop), `segment_track` (MIN_HOLD=2, MEDIANA), `crop_expression` (ffmpeg if-aninhado POR plano), `auto_frame` (scan único p/ várias janelas; sem pessoas→layout do usuário intacto) | vídeo + Draft.scenes → crop_track por cena | instalação sob demanda (opencv-headless 45MB), cooldown 30min, numpy purge (PYTHON-FASTAPI-40) | test_auto_framing.py |
| `backend/pipeline/quality.py` | 594 | **Qualidade programática (tira do LLM o que o código faz melhor)** | `DurationProfile` (tiers short/medium/long: min 20/45/90s, máx 150/300/480s, max_clips 6/10/16·h, topics_hint; `prompt_hint()` SOBRESCREVE regras fixas do prompt), `refine_timeline` (snap a cues ±3s; merge overlap≥0.5; estende até min p/ cues adjacentes gap≤5s; trim ao máx; merge/curto ou drop com relatório completo), `select_clips` (threshold + min_keep por score + max_clips), `align_scores` (id→outline→posicional; fallback 0.5 marcado) | itens + SRT → itens corrigidos + quality_report.json | drop com motivo por item; report p50/p90 snap | test_quality*.py (na árvore) |
| `backend/pipeline/step1_outline.py` | 301 (cabeça+estrutura lidos) | Legado: outline por chunks 30min | `OutlineExtractor.extract_outline`: parse SRT (falha → PipelineFailure SUBTITLE), profile salvo, prompt+hint, chunks → step1_*.json | SRT → outlines | PipelineFailure c/ hint | test_boundaries etc. |
| `backend/pipeline/step2_timeline.py` | 449 (cabeça+estrutura) | Legado: timeline por chunk | `TimelineExtractor.extract_timeline`: agrupa por chunk_index, cache raw LLM, report por chunk; refine via quality | outlines → timeline | timeline_failure_from_report | idem |
| `backend/pipeline/step3_scoring.py` | 194 (integral) | Scoring em lote | `ClipScorer.score_clips` (map_chunks paralelo por chunk; **transcript excerto 600 chars junto** ao outline no payload), `resolve_min_score_threshold` (CLI > settings > 0.7), align_scores | timeline → scored + step3_high_score | exceção por chunk → fallback all | test_*scoring |
| `backend/pipeline/step4_title.py` | 161 (integral) | Títulos | batch por chunk; falha → outline como fallback (nunca perde clipe) | high_score → titles map por id | por chunk, preserva dados | idem |
| `backend/pipeline/step5_clustering.py` | 361 (cabeça+estrutura) | Coleções temáticas | ClusteringEngine com max_clips_per_collection 1-20 | titles → collections | — | test_clustering |
| `backend/pipeline/step6_video.py` | 198 (corpo lido) | Render | `batch_extract_clips`, `create_collections_from_metadata`, salva `clips_metadata.json` (front) | titles+video → arquivos | — | render_ffmpeg_golden |
| `backend/mcp_server.py` | cabeça (1-60) | MCP stdio p/ IDEs | clip_video síncrono, start_clip_job async, export_clip 9:16, publish (TikTok etc.) | MCP tools | env-check | test_cli/test_mcp |
| `backend/core/local_presets.py` | 117 (chaves lidas) | **Conectores locais** | Ollama `http://localhost:11434/v1`, LM Studio; OpenAI-compat; hint recomenda `qwen2.5:7b` p/ chinês | settings | — | presets tests |
| `backend/pipeline/concurrency.py` | 45 | paralelismo por chunks (map_chunks) | — | — | — | — |

## Prompts (backend/prompt/, todos LIDO)
Estrutura por categorias de conteúdo (business/entertainment/knowledge/
opinion/speech/experience/content_review) + transversais: 大纲.txt (outline),
时间点.txt (timeline), 标题生成.txt (título), 推荐理由.txt (score/reason),
主题聚类.txt (clustering). PROMPT do clip_finder EMBUTIDO no .py (checado:
critérios 信息价值/情感共鸣/传播潜力/结构完整; regra de corte em Q&A completa;
título chinês ≤20 chars validado por regex CJK no _parse).


## Leitura da rodada 2 (orquestração + ASR + render + visão)

| Arquivo | Linhas | Papel | Descobertas-chave |
|---|---|---|---|
| `services/simple_pipeline_adapter.py` | 485 (integral) | **Orquestrador real** (clips_only=1) | preflight LLM ANTES de qualquer passo; media_precheck (vídeo<min/sem áudio+sem SRT falha antes de gastar modelo); checkpoint(project_id) de cancelamento entre TODAS as fases; one-pass → fallback legado silencioso NÃO: falha legada vira PipelineFailure com stage+hint+http_status; ProjectDeleted não escreve falha; clips_only pula clustering e REENCODE (Studio renderiza do original) |
| `services/studio/boundaries.py` | 404 (integral) | **Fronteiras por frase (2 passagens)** | Pass1 SEM modelo: TERMINAL/INNER_END regex (.?!。？！… + JA_END p/ japonês sem pontuação), PAUSE 0.6s como fim de frase quando não pontuado, `>>` troca de falante = fim; **_drop_trailing_question** (pergunta final = próximo tópico, corta ANTES dela se resposta<12s); nunca corta >40% do clipe p/ dropar pergunta; cauda 0.4s anti-clip de palavra; **snap a PAUSAS REAIS do áudio** (SilenceFinder, MATCH 1.3s, BREATH 0.5, PARAGRAPH 1.2s); Pass2 com modelo: contexto ±40/75 linhas, escolha validada pela pass1 (MAX_EXTEND 60s). NOSSO LADO: quality.py AutoClip só faz snap de CUE; boundaries.py é MAIS PROFUNDO (nível de caractere DENTRO da linha + pausas) |
| `services/studio/intelligence.py` | 371 (integral) | **Visão (opcional, consentimento)** | `analyze`: até 60 frames esparsos (intervalo máx 2s p/ 2h) → endpoint visão OpenAI-compat (NÃO Gemma local) → até 12 candidatos com event_type (gameplay/menu/reward/loading/other), watch_score 0-100 COM seleção_reason e evidence; **segunda passada Densa (25 frames) só no melhor candidato p/ refinar bordas**; prompts explicitamente proíbem inventar ações/nomes/publicidade; `select_highlights` filtra menu/reward/loading, ordena por watch_score, audit completo (selected/filtered/limit); consentimento separado (`source_frame_analysis_allowed` exige config+consent atuais) |
| `services/video_encoder.py` | 104 (integral) | Escolha de encoder | prova候选 (NVENC/QSV/AMF/VideoToolbox) com encode-teste 0.3s; falha real marca broken e CAI p/ libx264 (só culpa o HW se software passa no MESMO input — mesmo princípio do nosso encoder::detect) |
| `utils/llm_client.py` | 270 (integral) | Wrapper LLM | retry(3) no manager; _preprocess_llm_response (corta préâmbulo/cerca ```), _auto_fix (BOM/aspas chinesas), _validate_json_structure |
| `services/whisper_runtime.py` + `utils/speech_recognizer.py` | 289 + 945 (estrutura integral do runtime; recognizer: cabeças + caminhos-chave) | **ASR** | faster-whisper 1.2.1 (CTranslate2, ~200-400MB runtime) instalado SOB DEMANDA em data-dir com modelo em whisper-models (HF_HOME); modelos tiny→large-v3; **decodes preguiçosos = progresso real por segmento**; int8 primeira chamada warmup documentado; SenseVoice como alternativa (runtime próprio); cloud transcription opcional com erro próprio |
| `pipeline/media_precheck.py` | (lido cabeçalho) | Pré-voo | vídeo menor que clipe mínimo / sem áudio e sem SRT → falha ANTES do modelo |
| `services/publish_export.py` | 70+ cabeça | Export de publicação | PRESETS por plataforma (douyin etc.), render on-demand (não no pipeline), layout blur/crop/fit, 1 chamada ffmpeg |

### Síntese arquitetural (para a comparação G5)
1. **AutoClip é CLOUD-FIRST com modo local opcional**: LLM Manager = OpenAI-compat
   (nuvem padrão; Ollama/LM Studio = presets com janelas reduzidas 20min/12k chars
   e aviso de contexto ≥16K). Visão = endpoint cloud exclusivamente. ASR local =
   faster-whisper sob demanda. NOSSO LADO é LOCAL-FIRST por design.
2. **Separação custos LLM×programático** madura: quality.py (snap/merge/extend/
   trim por código em cues) + boundaries.py (frase/pausa por código) tiram do
   modelo o que regra determinística faz — o modelo só ESCOLHE e AVALIA.
3. **Studio (render por plano)**: plano→YuNet→boca-que-se-move→crop_x por shot
   (nossa M4 é diferença por CLIPE com um centro único; a deles é trajetória
   real por plano com fit-backdrop sem rosto).
4. **Falha honesta**: PipelineFailure com stage/código/hint/http_status; nunca
   "0 clipes sucesso"; preflight + precheck antes de gastar modelo.


## Leitura da rodada 3 (persistência, jobs/cancelamento, prompts, Studio-render) + complementar

### zhouxiaoka — persistência e jobs
| Arquivo | Linhas | Papel | Descobertas |
|---|---|---|---|
| `models/project.py`, `models/clip.py`, `models/task.py` + `repositories/*` (estrutura integral) | ~2.640 (repo total) | SQLAlchemy + repository pattern | Project com ProjectType por CATEGORIA (knowledge/business/opinion/experience/speech/content_review/entertainment — espelham as pastas de prompt); **LenientEnum com fallback**: valor antigo no banco não derruba a lista (contraste direto com nosso bug G3B do projects.json); status PENDING/PROCESSING/COMPLETED/FAILED; Task com celery_task_id, progress, current_step, error_message, result_data JSON |
| `tasks/processing.py` | 403 (integral) | Celery task | **Deduplicação por projeto em memória** (set+lock) — múltiplas entradas (/process, /retry, auto-start pós-download) não rodam 2 pipelines do mesmo projeto; Task row criada/fechada com sessões curtas (#175: não segurar conexão durante pipeline longo); status/error/stage propagados; clips_only → projeto NÃO marcado completed (Studio decide pelo render) |
| `core/project_cancellation.py` | 536 (cabeça integral + superfície) | **Cancelamento/deleção** | `cancel(pid)` marca + MATA filhos ffmpeg do projeto; `bind(pid)` contexto de trabalho; `checkpoint()` em cada fronteira levanta ProjectDeleted (FileNotFoundError: handlers existentes já tratam); JobStopped distinto (cancel sem deletar — vídeos prontos ficam); **quando worker para, bind REMOVE o que o job cancelado escreveu pós-delete**; ServiceRestarted (receipts não podem ser commitados pós-restart) |
| `services/studio/burned_subtitles.py` | 92 (integral) | Detecção de legenda queimada SEM OCR | banda inferior 960x192; brilho>200 adjacente a escuro<80; máscara de texto precisa MUDAR entre 12 amostras (logo estático não conta); MIN_FRAMES 60% |
| `services/studio/render.py` | 323 (cabeça + estruturas) | Render de drafts | `_mask_captions`: borra a banda de legenda queimada DO ORIGINAL antes de qualquer layout (evita dupla legenda); reutiliza `_build_filter` do publish_export (crop/fit/blur + ass); recuperação de packaging vazio com cues da fonte |
| `services/studio/store.py` | 727 (superfície) | Estado em disco com receipts | claim_render/bind (job assume render), receipts de leitura IO-failure, serialização por arquivo; atomicidade via temp+rename |
| `services/studio/jobs.py` | 1.750 (superfície) | Jobs do Studio | orquestra geração, templates, downgrade, restart recovery |

### zhouxiaoka — prompts por categoria (LIDO: speech/大纲.txt + speech/时间点.txt integrais; inventário das 7 categorias)
Estrutura comum: uma persona por categoria ("资深演讲内容策划师…"), 4 blocos de princípios
(valor/completude/atração/nível), regras de merge/split, instruções POSITIVAS e NEGATIVAS
("end_time NÃO pode ser o fim do bloco"), faixas de duração por natureza do conteúdo
(3-8min, estende a 10-12min em discurso profundo; gags 2-3min). **O DurationProfile.prompt_hint()
(quality.py) SOBRESCREVE os números fixos por tier no runtime** — os prompts são escritos
para 60min e o hint ajusta para o vídeo real. Mesmo padrão do nosso AUTOMATIC-MODE.

### artbyjazi/autoclip (complementar, dirigido) — rev 5d0eac3 (2026-08-01, MIT, 100 arq., 44 py)
| Módulo | Descoberta dirigida |
|---|---|
| `pipeline/boundaries.py` (integral docstring+constantes) | 3 passos: sentence-snap (12 palavras de busca) → duration-clamp SEMPRE em fronteira de frase → **silence-alignment com mapa de silêncio medido** (corte dentro do vale real; lead 0.12s p/ respiração, tail 0.28s, margem 0.04 da histerese do detector). Mesma trilogia do zhouxiaoka/boundaries mas com valores publicados como constantes |
| `pipeline/highlights.py` (docstring+constantes) | janelas 8min + overlap 60s (vs 60min/4min do zhou); dedupe IoU 0.4; **HOSTED_CONCURRENCY=3 vs LOCAL_CONCURRENCY=1** (modelo local satura GPU — concorrência extra só compete) |
| `pipeline/reframe/` (docstring integral do __init__) | Pipeline 9:16 mais maduro dos três: shots → **landmarks faciais** → tracks por pessoa → **diarização mapeada aos tracks UMA vez** → turn boundaries dirigem o framing → estratégia por plano (TRACK/WIDE/GENERAL) → path suavizado; "never jarring": biased to STILLNESS (frame travado levemente off-centre > frame sempre correto e sempre em movimento); EYE_LINE 0.38; lock se rosto>55% do crop |
| `pipeline/prepare.py` | WAV 16k mono uma vez + thumbnail strip + **mapa de silêncio** (silencedetect) como artefato de primeira classe |
| `providers/` | OpenAI/Anthropic/Gemini/**Ollama** (async httpx, health_check, _translate_status); LOCAL-first no design (concorrência 1) |
| `pipeline/captions.py`, `transcribe.py` | Whisper local (cuda.py escolhe device); legendas com palavra-nível p/ snap |

### Conclusão do estudo comparado dos três (para G5)
- **Fronteiras**: os DOIS AutoClips convergem em "código corrige o modelo": frase +
  pausa/silêncio medidas, clamp de duração em fronteira, drop de pergunta final
  (zhou) — nosso pipeline não tem NENHUMA dessas camadas determinísticas.
- **Reframe 9:16**: zhou = YuNet+boca (por plano), jazi = landmarks+tracks+diarização
  (mais completo), nosso M4 = centro único por clipe (o mais fraco; decidimos manter
  fora do caminho padrão).
- **Local**: jazi é local-first de verdade (concorrência 1, Ollama provider próprio);
  zhou é cloud-first com preset local. CutNicePro = local-first com motor dedicado.

## Cobertura pendente (declarada)
frontend web e src-tauri desktop dos DOIS repositórios (não entram no
pipeline de cortes: UI/desktop shell — leitura dirigida apenas se uma
comparação depender); prompts das categorias business/entertainment/…
(speech lido integral como representante do padrão; padrão estrutural
idêntico confirmado por amostragem); testes individuais (164 .py no
zhouxiaoka — inventariados, leitura por demanda); api/ HTTP (FastAPI
REST — não altera conclusões do pipeline).

## Descobertas que diferem do resumo investigado (a validar na comparação G5)
1. **YuNet + boca-que-se-move**: CONFIRMADO no código (framing.py
   `_speaker_center`, landmarks 10-13 = cantos da boca; motion>4.0);
   sem rosto → `fit` com backdrop borrado (não crop às cegas).
2. **Tracking é POR PLANO (shot), não contínuo**: pontos nos cortes,
   MIN_HOLD=2 amostras, mediana — mesma filosofia do nosso M4, mas com
   detector real (YuNet) e estimativa de falante por movimento labial.
3. **Pipeline dual**: one-pass (clip_finder) para janelas grandes +
   legado 6-step com chunks; LOCAL = janelas 20min/12k chars explícitas.
4. **Qualidade programática** (quality.py) é o coração editorial:
   snap/merge/extend/trim TUDO por código em cues do SRT, com relatório
   — diferença estrutural vs nosso pipeline (fronteiras por LLM+scene).
5. **Score 0-1.0 com threshold 0.7 + min_keep/max_clips por tier**;
   fallback marcado (`score_source=fallback`) — nunca esconde.
