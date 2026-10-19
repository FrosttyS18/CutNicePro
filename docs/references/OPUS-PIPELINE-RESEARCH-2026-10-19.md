# Pesquisa 03M — modelos e responsabilidades

Consulta em 2026-10-19. Fontes primárias; anúncios históricos não demonstram a composição atual de todos os serviços do concorrente.

Nota da revisão documental 03N: esta pesquisa do concorrente não substitui estudar o código dos projetos open-source indicados pelo mantenedor. O estudo por módulos e a adaptação ainda não estão demonstrados; ver OPEN-SOURCE-ENGINE-RESEARCH.md. O mantenedor rejeitou a linguagem técnica da análise atual e os clipes 9:16 com faixas: validação de citações/dimensões não comprovava os resultados desejados. Tabela da entrega 03M abaixo descreve capacidades implementadas, não aceite editorial/visual ou equivalência com Opus.

## O que a documentação confirma

O [estudo oficial do Google de 20/11/2024](https://developers.googleblog.com/opusclip-achieves-30-percent-cost-savings-in-visual-description-processing-with-gemini-flash/) descreve Gemini 1.5 Flash produzindo descrições visuais para ClipAnything. O contexto inclui ações, emoções, áudio e diálogo. Isso demonstra uma função multimodal específica; não demonstra que esse modelo faz sozinho transcrição, edição, ranking e renderização atuais.

O [anúncio oficial do Opus de 07/05/2025](https://www.opus.pro/blog/announcing-opusclip-thumbnail) atribui ao GPT-4o a geração de thumbnails. Não é evidência de GPT-4o como motor de transcrição ou seleção de todos os cortes. A [página oficial ClipAnything](https://www.opus.pro/clipanything) descreve seleção multimodal e ReframeAnything com rastreamento e reenquadramento. ClipAnything/ReframeAnything são nomes de recursos/sistemas; a página não fornece pesos, arquitetura completa ou uma receita reproduzível do serviço.

A afirmação sobre GPT-3.5 Turbo em versão antiga não foi confirmada nesta pesquisa. O print do mantenedor é referência para investigação, não comprovação técnica de uma configuração atual.

## Diagnóstico do CutNicePro e decisão desta entrega

| Etapa | Antes da 03M | Alteração implementada |
|---|---|---|
| Abrir clipe | Efeito da inspeção iniciava análise; modal de outra instância acompanhava o job | Leitura/reprodução; análise explícita e operação identificada no job |
| Rejeitar | Registro continuava na lista padrão, sem fechamento/retorno claro | Persistência confirmada, fechamento e filtro ativo; origem preservada |
| ASR | Uma execução para todo o áudio | Blocos de 180 s, contexto de 2 s, checkpoints e tempos absolutos |
| Escolher momentos | Pré-seleção por heurísticas antes do modelo | Modelo lê todas as janelas sobrepostas; seleção final por pontuação semântica e não sobreposição |
| Analisar corte | Modelo precisava repetir literalmente as evidências | IDs de citações; backend monta e verifica as falas; falha individual não descarta a coleção |
| Inferência textual | CPU forçada | Vulkan detectado, ajuste de memória e fallback sequencial em CPU |
| Cenas | Percorria vídeo inteiro | Regiões de ±1 s ao redor das extremidades dos candidatos, com cache |
| Codificação | libx264 | Sondagem real NVENC e fallback libx264; saída conferida com ffprobe |

Whisper continua responsável por reconhecer fala. Qwen3-4B Q4_K_M é um modelo de texto separado de Qwen3-ASR e trabalha sobre a transcrição. FFmpeg detecta transições locais e renderiza; não substitui entendimento visual. O gate global mantém processamento exclusivo; arquivos de outros modelos não os executam. Processos são sequenciais, inclusive no fallback.

Nosso pipeline permanece textual para escolher/resumir momentos. Não identifica visualmente ações, rostos ou emoções e não recebeu um modelo multimodal nesta entrega. Citações corretas não garantem interpretação correta. Notas são critérios editoriais sobre o trecho, sem previsão de tendência/viralização. Não há equivalência de qualidade demonstrada com OpusClip.

## Fontes de implementação e limites

- [llama.cpp: build e backends](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md), [release b11729](https://github.com/ggml-org/llama.cpp/releases/tag/b11729): binário Vulkan da mesma versão do CPU; flags de dispositivo/memória conferidas também na ajuda local. `-ngl auto`, `--fit on`, margem de 1024 MiB; se o processo falhar, uma tentativa CPU após conferir cancelamento. Não executa dois modelos ao mesmo tempo.
- [NVIDIA: FFmpeg/NVENC](https://docs.nvidia.com/video-technologies/video-codec-sdk/13.0/ffmpeg-with-nvidia-gpu/index.html): NVENC acelera a codificação, não todo filtro/decodificação. A sondagem inicial em 128×128 falhou com dimensão mínima na RTX 5070; corrigida para 640×360. O teste real produziu H.264 1080×1920, AAC, 2 s, com `h264_nvenc`.
- [FFmpeg: opções de entrada/saída](https://ffmpeg.org/ffmpeg-all.html): extração com seek e duração delimitada; filtro de detecção de cenas somente nas regiões escolhidas. A varredura regional ajusta limites, não compreende o assunto.
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp): CLI/JSON/DTW mantidos. Checkpoints são do aplicativo, não uma promessa do motor. Chave inclui mídia, duração, modelo, executável e configuração. Corrompidos são refeitos; concluídos são limpos após publicação; cancelamento preserva os válidos.
- [Happy DOM](https://github.com/capricorn86/happy-dom): dependência apenas de desenvolvimento, versão fixa 21.0.3. Necessária para executar efeitos/cliques React em memória: renderização estática anterior não detectava o processamento automático na abertura. Não foi aberto navegador ou aplicativo para esses testes.

RTX 5070 de 12 GB é o hardware efetivamente exercitado. Uso de memória observado é da placa inteira, não pico isolado do modelo. Nenhuma GPU abaixo de 8 GB foi testada nesta entrega; seleção automática e fallback não substituem uma matriz de hardware. Runtime/pesos estão nas ferramentas locais de desenvolvimento; distribuição instalável continua pendente. Não houve uso de API comercial ou envio de vídeo/áudio para provedor externo.
