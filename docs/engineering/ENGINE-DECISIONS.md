# CutNicePro — Decisões Técnicas do Motor (ENGINE-DECISIONS)

**Estado:** F0 — inventário inicial (2026-10-19). Documento vivo; cada fatia atualiza.
**Escopo atual:** M2a (importação persistente + análise) → M3 (transcrição local → legendas/export). M4+ fora do escopo.

## 1. FFmpeg / FFprobe (fatos do binário concreto — F0)

- **Origem da instalação:** `winget install --id Gyan.FFmpeg` — executada por ZCode em
  2026-10-19 com autorização explícita do mantenedor (exceção registrada à regra
  "não modificar fora de C:\CutNicePro").
- **Caminho real do binário:**
  `C:\Users\adcka\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin\{ffmpeg,ffprobe,ffplay}.exe`
  Aliases de linha de comando adicionados pelo winget em
  `%LOCALAPPDATA%\Microsoft\WinGet\Links` (incluídos no PATH do usuário).
- **Versão (banner do próprio binário):** `ffmpeg version 9.0.2-full_build-www.gyan.dev`,
  `built with gcc 16.2.0 (Rev3, MSYS2)`; libavutil 61.1.102 / libavcodec 63.1.102 /
  libavformat 63.1.102.
- **Configuração de build (fatos declarados pelo binário, sem conclusão jurídica
  nossa):** `--enable-gpl --enable-version3 --enable-static` + libs habilitadas
  relevantes para este produto: `--enable-libx264 --enable-libx265 --enable-libvpx
  --enable-libass --enable-libfreetype --enable-libfribidi --enable-libharfbuzz
  --enable-libopus --enable-libvorbis --enable-libmp3lame --enable-libtheora
  --enable-mediafoundation --enable-d3d11va --enable-d3d12va --enable-nvenc
  --enable-nvdec --enable-ffnvcodec --enable-whisper`. O build "full" do gyan.dev é
  distribuído pelo autor com `--enable-gpl`; a nota de licença oficial do build é
  gyan.dev/ffmpeg/builds (packaging: builds "full" = GPLv3). Uso no produto:
  subprocess (spawn) de binário instalado pelo usuário — sem vinculação estática
  nem redistribuição do binário pelo app. **Não é intenção deste registro emitir
  conclusão jurídica; apenas fixar os fatos verificáveis do binário em uso.**
- **ANTES da instalação (registro honesto):** não havia FFmpeg/ffprobe de sistema;
  os e2e das fases 03D–03F usavam `ms-playwright\ffmpeg-1011\ffmpeg-win64.exe`
  (cache do Playwright) — não adequado para produto (pode sumir em atualização,
  sem ffprobe). Corrigido nesta fase: fixtures e testes passam a usar o binário
  do winget (PATH), e o app NÃO depende do cache do Playwright.
- **Estratégia de binário no MVP:** detectar FFmpeg em tempo de execução pela
  ordem: (1) `PATH` (`where ffmpeg`/`ffprobe`); (2) caminho do winget acima
  (alias links); (3) `app-data\cutnicepro\bin\` (futuro download gerenciado).
  Ausência → funcionalidades de análise/export ficam indisponíveis com
  causa ("FFmpeg não encontrado") e ação (instrução de instalação oficial);
  importação por cópia continua funcionando (não depende de FFmpeg).
  **Bundling/verificação automática de binário: pendência** (exige estudo de
  distribuição e licença; fora do escopo M2a/M3).
- Nota F0: o build contém `--enable-whisper` — registrado como fato; a decisão
  de transcrição (whisper.cpp vs filtro embutido) é da Fatia 2, após benchmark.

## 2. Hardware (fatos — F0, para a decisão da Fatia 2)

- CPU: AMD Ryzen 7 5700X — 8 núcleos / 16 threads.
- RAM: 31,9 GB.
- GPU: não inventariada em F0 (não necessária para M2a). Inventariar na Fatia 2
  se o candidato de transcrição usar aceleração.

## 3. Decisões da Fatia 1 (M2a — importação persistente + análise)

- **Política de importação (mantenedor):** CÓPIA para
  `app-data\cutnicepro\media\files\<sha256>.<ext>`; sem referência por caminho
  no MVP. Detalhes e critérios: `docs/engineering/M2A-IMPORT-SPEC.md`.
- **Deduplicação:** por hash do conteúdo, com **referências explícitas**
  (`project_ids: Vec<String>` por entrada no índice) — sem contador independente.
- **Índice:** `app-data\cutnicepro\media\index.json`, escrita tmp→swap (padrão do
  storage.rs), mutações serializadas por Mutex de processo; reconcile na
  inicialização ADOPTA arquivos finais sem entrada (nunca apaga), remove apenas
  `.part` de jobs mortos, suspende limpeza se o índice estiver corrompido.
- **Análise:** `ffprobe -v quiet -print_format json -show_format -show_streams`
  (explícito, conforme emenda do mantenedor) no arquivo publicado; resultados
  (duração ms, largura/altura, codecs, fps, has_audio) persistidos na entrada.
- **Mídia servida ao WebView:** scheme `cnplocal` registrado como protocolo
  assíncrono (no Windows/WebView2 acessível como `http://cnplocal.localhost/...`,
  mesmo padrão do `cnpmedia` da 03B.6, que permanece intocado para o CDN).
  Whitelist = hashes presentes no índice; `Accept-Ranges`/`206`/`Content-Range`
  para seek; `Access-Control-Allow-Origin: *` para os canvases de miniaturas
  (filmstrip usa `crossOrigin="anonymous"`).
- **Seleção de arquivo:** dialog nativo `tauri-plugin-dialog` (oficial) — retorna
  caminho real. Drag-and-drop: reabilitado `dragDropEnabled` + eventos
  `tauri://drag-drop` (paths reais) — importação do arquivo solto funciona;
  highlight visual por `tauri://drag-over/enter/leave`.

## 4. Pendências registradas (não resolvidas aqui)

- Bundling/distribuição do FFmpeg (M5+) e download gerenciado em app-data\bin.
- Decisão de motor/modelo de transcrição local (Fatia 2 — benchmark pendente).
- BYOK, YouTube download, referência-por-caminho de mídia (etapas futuras).

## 5. M3A — implementação local inicial (2026-10-19)

Autorização de implementação: mantenedor solicitou começar o motor. Durante a execução, restringiu validação a código/compilação; testes visuais e do fluxo no app são dele. Não há aprovação de qualidade do ASR.

- whisper.cpp CPU x64 oficial, asset da tag `b5454`, CLI informa `1.9.5`. ZIP: 8.928.640 bytes, SHA-256 `6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb`. Fonte: https://github.com/ggml-org/whisper.cpp/releases/tag/b5454 .
- Modelo multilíngue `ggml-base.bin`: 147.951.465 bytes, SHA-256 `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe`. Fonte: https://huggingface.co/ggerganov/whisper.cpp . Ambos baixados e hashes conferidos no workspace; não versionados. Setup reproduzível em `tools/engine/setup-whisper.ps1`.
- Escolha Base é inicial de desenvolvimento. Benchmark tiny/base/small e inspeção humana continuam pendentes, sem promover a decisão definitiva.
- Caminho de desenvolvimento: `.tooling/vendor/whisper`; override explícito `CNP_ENGINE_HOME`; distribuição espera `app-data/cutnicepro/engine`. Nenhum download silencioso em produção, envio de mídia ou alteração do PATH.
- Extração local FFmpeg → WAV PCM mono 16 kHz; CLI `-l pt -ng -oj`; offsets JSON em milissegundos convertidos para segundos. Jobs exclusivos; cancelamento mata/aguarda o filho; edição e conclusão serializadas. JSON por projeto salvo com substituição do arquivo temporário sincronizado; cache de UI aceita modo `real`.
- Implementação e limitações: `M3A-TRANSCRIPTION-SPEC.md`; roteiro do mantenedor: `M3A-MANUAL-CHECK.md`. Exportação, download YouTube, instalador, fila persistente e benchmark seguem pendentes.

Licenças de origem consultadas: whisper.cpp MIT (https://github.com/ggml-org/whisper.cpp/blob/v1.9.5/LICENSE) e Whisper MIT (https://github.com/openai/whisper/blob/main/LICENSE). Não houve bundling/distribuição de instalador; obrigações da distribuição dos binários permanecem na etapa de empacotamento.

## 6. Refinamento de transcrição/editor (2026-10-19)

Small multilíngue substitui Base como padrão de desenvolvimento, após relato de erros de fala. Base permanece instalado. Small: 487.601.967 bytes, SHA-256 `1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b`, conferido após download oficial no workspace. Não é escolha definitiva baseada em benchmark: qualidade, tempo e alinhamento no vídeo do mantenedor continuam pendentes.

CLI usa JSON completo (`-ojf`) e busca `-bs 5 -bo 5`; tokens com offsets reais são agrupados em palavras. Registros antigos permanecem válidos sem tempos de palavra; editar texto invalida o alinhamento desse trecho. Nenhuma divisão proporcional inventada. Detalhes internos e migração não aparecem na UI.

Miniaturas e onda usam FFmpeg local em módulos separados, cacheadas por hash: 24 imagens e 600 picos de PCM real. Testes em código aprovados; não houve execução do app, geração real dessas prévias ou benchmark nesta tarefa, conforme limite do mantenedor. Contratos e conferência: `EDITOR-TIMING-SPEC.md` e `EDITOR-TIMING-MANUAL-CHECK.md`.

## 7. Correção 03H (2026-10-19)

Mantenedor aceita modelo maior e prioriza qualidade. Novo padrão de desenvolvimento Large v3 Turbo oficial: 1.624.555.275 bytes, SHA-256 `1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69`, download e hash conferidos no workspace. Modelos anteriores preservados; setup reproduzível atualizado. Fontes/limites em EDITOR-USABILITY-SPEC.md. Não há benchmark aprovado ou novo envio externo de mídia.

DTW nativo fornece inícios de tokens em centissegundos; offsets continuam em milissegundos. Adaptador preserva fronteiras de tokens instantâneos; frontend alinha cada palavra e preserva tempos ao corrigir uma palavra. Busca mantém beam/best-of 5, contexto anterior limitado a zero e supressão de tokens não falados. Flags verificadas no help do binário existente; nova inferência reservada ao mantenedor.

Onda v2: PCM mono 16 kHz, densidade de até 120 picos por segundo/300 mil e canvas na resolução visível. Exclusão confirmada possui marcador persistente de recuperação, remove somente cópias gerenciadas sem outros vínculos, preserva origem/exports. 164 casos únicos aprovados (58 Rust, 106 frontend); runtime e estética pendentes, conforme instrução do mantenedor.

## 8. Editor e arquivos 03I (2026-10-19)

Nenhuma mudança de motor/modelo, dependência ou download. Fontes Poppins local e famílias do sistema; CaptionStyle opcional com validação e recuperação isolada de preferências visuais inválidas. Estilos têm efeito no player e são persistidos. Export TXT/SRT usa registro real salvo e intervalos em segundos; cópia do vídeo usa somente mídia gerenciada vinculada ao projeto. Seletor do plugin dialog existente, escrita atômica e proteção contra destino na pasta interna; sem permissão genérica de filesystem adicionada ao frontend. Render MP4 continua pendente e não é representado pela ação Salvar vídeo. Compartilhamento adiado expressamente. Contrato/roteiro EDITOR-CONTROLS-*; 178 casos únicos de código aprovados, sem validação visual/runtime automática.


## 9. Editor e cortes 03J (2026-10-19 — IN REVIEW)

Mantenedor autorizou geração de cortes, notas e legendas além dos ajustes de UI.
Phosphor React 2.1.10 (MIT) adicionado: ícones de ferramentas e transporte por
imports individuais. Poppins TTF oficial/OFL incluído no executável para libass;
seis variantes correspondem aos pesos/itálicos oferecidos na interface.

FFmpeg de sistema não foi encontrado nesta sessão; o registro de instalação
winget acima é histórico, não prova de disponibilidade atual. Preparada cópia
portátil apenas em .tooling/vendor/ffmpeg/ffmpeg-9.0.2-essentials_build/bin,
114.768.076 bytes no ZIP, SHA-256 60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba
igual ao arquivo .sha256 do distribuidor. Origem: gyan.dev, referenciado pela
página oficial https://ffmpeg.org/download.html. Nenhuma instalação no sistema,
PATH ou bundling alterados. Banner: ffmpeg 9.0.2-essentials_build-www.gyan.dev,
built with gcc 16.2.0; configuration contém --enable-gpl --enable-version3
--enable-static --enable-libx264 --enable-libass --enable-libfreetype.
ffmpeg -L declara GPL versão 3 ou posterior. São fatos do binário concreto,
sem conclusão jurídica sobre o aplicativo. Coleta: 2026-10-19, nesta tarefa.
Detecção usa CNP_FFMPEG_HOME opcional, PATH, WinGet, pasta gerenciada e fallback
portátil somente em desenvolvimento; cache Playwright é excluído.

DEC-012: ASR Large v3 Turbo preservado; comparação Large v3/Qwen3-ASR registrada
em ASR-QUALITY-2026-10-19.md, sem benchmark ou troca não validada. DEC-013:
ProcessingGate serializa ASR/análise/render/salvamento/exclusão, além dos
registries de jobs existentes. Processos rastreados e cancelamento por token.

Cortes: intervalos reais por fala, cena e limites de duração, score heurístico
explicável (BR-023), supressão de sobreposição, revisão e persistência separada.
Render: trim, proporção/fit/foco, áudio, texto e legenda ASS por tempos reais;
valida saída com ffprobe e publica apenas após sucesso. Preparação do destino
ocorre fora do lock de publicação, permitindo cancelamento durante a cópia.
Progresso visual limita-se ao progresso medido e para ao alcançar esse valor.

200 casos únicos de código aprovados (127 frontend, 73 Rust), incluindo MP4 real
sintético e pixels de legenda. Tauri, seletores nativos, vídeo do mantenedor e
estética não testados; nenhuma história/épico promovido a aceito apenas por código.

## 10. Comparação ASR e aceleração — 2026-10-19, IN REVIEW

Quatro candidatos transcreveram a mesma amostra pt-BR de 30 s; dez casos concluídos
em sequência. O motor nativo b5454/CUDA 12.4 reconheceu e executou na RTX 5070. Dois
Whisper entram na escolha do app, com DTW específico e CPU explícita; os pesos de
modelos antigos permanecem arquivos inativos. O gate global continua exclusivo.
Sondagem por ajuda do utilitário Parakeet apenas enumera dispositivos, sem pesos.
Qwen/Parakeet não são apresentados como integrados: faltam adaptadores de tempos,
vídeos longos e distribuição. Precisão sem WER; memória total da placa não é pico
exclusivo do modelo. Não prometer aceleração em toda GPU ou partida fria. Evidências,
versões, hashes e limitações: docs/references/ASR-BENCHMARK-2026-10-19.md.

## 11. Isolamento e análise textual dos cortes — 2026-10-19, IN REVIEW

Correção 03L: origem exibida sem edições; formato gerado incluído no ID e na coleção nativa; configurações do vídeo completo e mapa local por corte isolados. Legado sem formato usa proporção suportada próxima à mídia e contain. Metadados de formato/análise/revisão persistem no backend; ajustes finos do editor continuam no workspace local.

Análise de texto por llama.cpp b11729 e Qwen3-4B Q4_K_M, local/CPU, até oito threads, contexto 8192 e saída limitada a 1100 tokens. Reutiliza gate global, cancelamento e diretório temporário de render. JSON limitado por esquema e três critérios com citações conferidas na fonte; pontuação editorial 40/30/30, sem previsão de viralização ou visão computacional. Alteração da transcrição invalida análise e aprovação. Recurso ausente ou resposta inválida falham sem publicar texto genérico. Justificativa: frequência de termos e cadência anteriores não produziam resumo semântico do conteúdo, conforme defeito reportado pelo mantenedor.

Binários/pesos verificados e instalados em .tooling/vendor/analysis, ignorados pelo Git; distribuição instalável pendente. Modelo ocupa 2.497.280.256 bytes. Fontes: https://huggingface.co/Qwen/Qwen3-4B-GGUF e https://github.com/ggml-org/llama.cpp/releases/tag/b11729. Hashes/evidências no manifesto de runtime da entrega.

Seis configurações Whisper de 86 s foram comparadas à referência automática imperfeita e às âncoras humanas. Não recuperaram todas as correções, e contexto pode piorar siglas; sem mudanças no padrão ASR. GPU CUDA comprovada nos logs, apenas um Whisper por execução. Não adotar substituições globais nem transformar distância contra texto Opus em alegação de precisão. ASR-REFINEMENT-2026-10-19.md registra a falha de prompt Unicode no Windows e a única repetição do caso afetado.
