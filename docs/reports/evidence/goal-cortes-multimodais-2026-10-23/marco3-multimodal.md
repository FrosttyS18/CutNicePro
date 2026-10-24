# MARCO 3 — Índice temporal, descoberta multimodal e comparação delimitada (2026-10-23)

## Implementação
- **`clips/multimodal.rs`** (novo): adaptador do llama-server multimodal.
  - `discover(base)`: exe oficial (`.tooling/vendor/llamacpp-b11829` em dev;
    `bin/` do motor em instalações) + modelo `gemma_model_path` + mmproj
    OFICIAL ao lado do GGUF. `None` = degradação textual DECLARADA (backend
    distinto no registro); kill-switch `CNP_DISABLE_MULTIMODAL` (testes e
    controle do usuário).
  - `Server`: porta efêmera (bind :0), spawn `-mm mmproj -c 8192 -ngl 99`,
    /health com teto 120 s, kill no Drop (sem órfãos). `completion()` usa o
    prompt canônico já templated + `stop:["<turn|>"]` + amostragem Gemma
    (temp 1.0/top_k 64/top_p 0.95/seed 42) + schema como `json_schema`
    (fallback sem se o build recusar). `vision()` usa
    `/v1/chat/completions` com imagens base64 (MIME por magic bytes) e
    `reasoning_effort:"none"` (SEM isso o thinking consome o orçamento —
    MARCO 1).
  - `LazyServer`: sobe na primeira chamada e vive pelo job (Engine é o dono).
  - **Índice temporal (evidências reais)**: `audio_pauses()` — uma passada
    FFmpeg `silencedetect` (-35 dB, ≥0,45 s) por geração; `extract_frame()`
    — frame JPEG real (≤512 px) por timestamp; `enrich_clip()` — ajusta
    fronteiras para a borda da fala quando caem em pausa (≥0,3 s, respeita
    duração mínima; bug de sinal achado pelo teste e corrigido), extrai
    frames (início+0,35 e meio), pede resumo visual ESTRITAMENTE fundamentado
    nas imagens (transcrito e eventos entram como CONTEXTO, não instrução),
    grava `MultimodalEvidence{frames, visual, audioEvents,
    boundaryAdjustments, backend}` no clipe.
- **`text_engine.rs`**: `Engine::GemmaMultimodal` — mesmos prompts/amostragem
  do experimental, gerando via server; `count_tokens` reaproveita o
  tokenizador. `Engine::discover(ExperimentalGemma)` prefere multimodal e
  degrada para textual quando faltam artefatos (registro distinto, nunca
  silencioso).
- **`generation.rs`**: pausas computadas 1×/geração; enriquecimento por
  candidato (falha de UM clipe não derruba a rodada); **gate de honestidade**:
  multimodal declarado + tentativas > 0 + NENHUMA evidência real → erro
  explícito (não existe "multimodal PASS" só com ASR+texto).
- **Contrato UI**: `Clip.multimodal` (TS+Rust, opcional, validado em runtime
  no parse) e seção "Evidências recebidas" na inspeção do clipe (frames com
  timestamps, pausas, ajustes de borda, texto+áudio+frames vs texto).
- reqwest: features `blocking`+`json` habilitadas (mesma crate/versão; HTTP
  local para processo filho próprio).

## Comparação delimitada (M3.8) — amostra RESERVADA declarada ANTES da execução
- Amostra: janela **360–720 s** (min 6–12) do vídeo de 24,6 min + ±2 min de
  contexto (transcrição REAL de 219 segmentos, cópia por projeto — dados do
  mantenedor somente leitura). Parâmetros idênticos nos braços:
  `automatic`, 9:16, cover, `experimentalGemma`, mesma transcrição, mesma
  mídia (dedupe), mesmo hardware (Ryzen 5700X/RTX 5070/Vulkan).
- **Braço A (textual, CNP_DISABLE_MULTIMODAL=1)**: 674 s, 9 cortes, backend
  `experimentalGemma`, 0 evidências. Notas 37–91.
- **Braço B (multimodal)**: 2276 s (inclui server, silencedetect, 10×
  enriquecimento visual e geração via server), **10 cortes, 10/10 com
  evidência REAL** (frames com timestamp + resumo visual), backend
  `experimentalGemmaMultimodal`. Notas 49–98.
- **Evidência visual é genuína e consistente**: em todos os cortes o modelo
  descreve o MESMO cenário real do vídeo — homem de óculos, camiseta branca,
  microfone de podcast, ambiente interno com estante — com variações
  específicas por janela (gesto com a mão, lendo algo, prateleiras ao fundo).
  Isso só é possível com payload visual real (par controlado do MARCO 1).
- **Pausas de áudio**: nenhuma ≥0,45 s dentro dos cortes selecionados
  (podcast contínuo) → ajustes de borda 0 (comportamento correto: sem pausa
  não se mexe). O mecanismo tem teste unitário próprio e o log
  silencedetect fica no scratch do job.
- **Diferenças de seleção/notas entre braços NÃO são atribuíveis só à
  modalidade** (caminho de execução/amostragem difere: exe vs server) —
  registro honesto; o ganho COMPROVADO do B é a evidência visual/sonora
  fundamentada por clipe (novo) e a base para o M4 (enquadramento).

## Bugs achados e corrigidos nesta rodada
1. `snap_edge_to_speech`: sinal da duração invertido (achado pelo teste
   unitário novo — teria encolhido clipes em vez de preservar mínimo).
2. Exe do lab desatualizado (cargo build ausente pós-M3) → 1ª execução do
   lab rodou textual nos DOIS braços; DETECTADO pelo registro de backend e
   reexecutada corretamente.
3. Escrita do heredoc crash esvaziou multimodal.rs (vazio compila como
   módulo válido) — reescrito por completo; lição registrada: nunca heredoc
   multiline em bash para arquivos Rust.

## Provas executadas
- Rust 146/146 (novos: base64 RFC 4648 vetores; degradação com kill-switch;
  snap de borda com mínimo; POST do server contra mock HTTP validando
  stop/temperatura/seed).
- TS 227/227 + tsc + eslint OK (contrato multimodal validado em runtime no
  parse; exibição na inspeção).
- App REAL: dois braços end-to-end com geração REAL (sem mocks), coleções
  persistidas com engine distintos; evidências em `m3-arm-*.json` +
  `m3-comparison.json` (copiados para esta pasta).

## Estado
M0 ✓ M1 ✓ M2 ✓ **M3 ✓**. Pendentes: M4 (tracking controlado + framing),
M5 (auto pós-import + recuperação), matriz A–I e aceite editorial.
Orçamento acumulado ≈ 7,5 h de 8 h — M4/M5 na próxima rodada.
