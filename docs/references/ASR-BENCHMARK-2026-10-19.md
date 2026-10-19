# Comparação local de transcrição — 19 de outubro de 2026

Estado: avaliação técnica inicial; precisão e escolha definitiva pendentes de referência humana.

Os quatro modelos solicitados transcreveram a mesma amostra do vídeo Davy Jones. O teste confirmou execução local e revelou diferenças de texto e desempenho. Ele não estabelece um vencedor universal de precisão.

## Ambiente e método

- Ryzen 7 5700X, 8 núcleos/16 threads; 34.267.009.024 bytes de RAM física.
- NVIDIA GeForce RTX 5070, 12.227 MiB de VRAM, driver 610.88. Na primeira consulta havia 4.913 MiB livres; outros aplicativos permaneceram abertos.
- Primeiros 30 segundos do arquivo original, convertidos para WAV PCM mono a 16 kHz. Áudio não enviado a serviços externos.
- Um modelo/processo por vez. Oito threads nos motores que permitem configuração. Sem encerrar aplicativos do usuário.
- Uma execução por caso, sem aquecimento controlado. Carga de arquivo, inicialização e compilação de operações podem afetar especialmente a primeira execução CUDA. Não interpretar a tabela como ranking estável de velocidade.
- Whisper nativo: b5454, beam/best-of 5, português, contexto anterior desativado, DTW correspondente ao modelo, flash attention desativada para esse alinhamento. Mesmos parâmetros na CPU e GPU.
- Comparação adicional: faster-whisper 1.2.1/CTranslate2 4.8.3; CPU int8 e GPU float16. A diferença de precisão numérica impede atribuir toda mudança de texto exclusivamente ao dispositivo.
- Qwen: qwen-asr 0.0.6, Transformers 4.57.6, PyTorch 2.11.0+cu128, bfloat16, lote 1, idioma Portuguese, limite de 1.024 tokens. Sem ForcedAligner neste teste.

## Resultado no motor nativo

Tempos totais informados pelo motor, incluindo sua carga inicial, sem downloads.

| Modelo | CPU | RTX 5070 | Arquivo de pesos usado |
|---|---:|---:|---:|
| Whisper Large v3 Turbo | 25,92 s | 32,04 s | 1,51 GiB |
| Whisper Large v3 completo | 67,09 s | 10,81 s | 2,88 GiB |
| Parakeet TDT 0.6B v3 | 7,76 s | 17,90 s | 1,17 GiB |

O Large v3 completo foi cerca de 6,2 vezes mais rápido na GPU nessa execução. Turbo e Parakeet tiveram partidas CUDA mais lentas que suas execuções CPU. Não extrapolar esses resultados para vídeos longos, GPUs diferentes ou execuções já aquecidas.

## Outros motores avaliados

| Modelo/motor | Dispositivo | Carga | Transcrição/alinhamento | Total após download |
|---|---|---:|---:|---:|
| Turbo / CTranslate2 | CPU int8 | 4,50 s | 13,90 s | 18,40 s |
| Turbo / CTranslate2 | CUDA float16 | 1,62 s | 11,05 s | 12,67 s |
| Large v3 / CTranslate2 | CUDA float16 | 24,80 s | 4,49 s | 29,29 s |
| Qwen3-ASR 1.7B | CUDA bfloat16 | 16,69 s | 12,99 s, apenas texto | 29,68 s |

Os dois arquivos safetensors do Qwen somam 4.698.521.512 bytes, cerca de 4,38 GiB. “1.7B” é o nome do modelo; não significa um download de 1,7 GB.

## Precisão: o que foi e não foi demonstrado

Os textos completos dos dez casos concluídos estão em [evidência JSON](../reports/evidence/2026-10-19-asr-comparison.json). Houve diferenças claras: no trecho inicial, Turbo/CTranslate2 reconheceu “entrar no GTA”; Qwen escreveu “transitar”. Nomes e expressões como EA FC e medonho também variaram entre modelos e motores. Isso é uma observação dessa amostra, não uma medição de taxa de erro.

Não há transcrição humana revisada para calcular WER/CER. Não foi demonstrado que Large v3 ou Qwen sempre superam Turbo em português brasileiro. Parakeet foi promissor na CPU, mas sua precisão precisa ser revisada no conteúdo do usuário. A documentação da NVIDIA avisa que o português de treinamento é europeu: [model card do Parakeet](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3).

O teste Rust explícito leu os JSON reais dos dois Whisper na GPU e do Large completo na CPU, passou pelo parser canônico e confirmou mais de 80 palavras com tempos válidos, inclusive após 25 segundos. Não é validação humana do sincronismo de cada palavra.

Qwen foi avaliado apenas para texto. Para tempos por palavra, o projeto oficial oferece outro modelo de alinhamento; essa etapa não foi instalada nem validada aqui: [Qwen3-ASR, exemplos oficiais](https://github.com/QwenLM/Qwen3-ASR#python-package-usage). O Parakeet nativo registrou tempos de tokens, mas ainda não há adaptador desse formato no app.

## Placas com menos de 8 GB

O tamanho do arquivo de pesos não é o consumo total de VRAM. Os logs nativos registraram aproximadamente 1,62 GB de pesos do Turbo, 3,09 GB do Large completo e 1,26 GB do Parakeet na GPU, além de buffers de trabalho e contexto do dispositivo.

No Qwen, o pico do alocador PyTorch foi 4.480,79 MiB, cerca de 4,38 GiB, sem o alinhador. Esse número não inclui toda a memória do driver e dos outros aplicativos. Nos outros motores, o monitor registrou memória da placa inteira; ela não pode ser apresentada como pico exclusivo do modelo. Um valor zero do alocador PyTorch no CTranslate2 não significa ausência de uso da GPU.

- Em 4 GB, não presumir que Large completo ou Qwen caberão; Turbo, um modelo quantizado validado ou CPU são caminhos para avaliar.
- Em 6 GB, a memória livre e os buffers importam tanto quanto o total anunciado. Qwen com alinhamento exige avaliação própria; nenhuma garantia foi estabelecida.
- Mesmo em 8 GB, jogos e outros aplicativos podem deixar pouca memória livre. A opção de usar somente o processador é necessária.
- Não foi testada fisicamente uma placa de 4, 6 ou 8 GB. Quantização, outros tamanhos de lote e outras GPUs não foram validados.

## O que entrou no app

- Escolha entre **Rápido — Whisper Large v3 Turbo** e **Completo — Whisper Large v3** antes de iniciar.
- Uso automático do pacote CUDA quando ele encontra uma GPU compatível; alternativa **Usar apenas o processador**.
- CPU preservada como alternativa. Cada chamada seleciona exatamente um arquivo de pesos e um DTW correspondente. O bloqueio global de processamento impede duas transcrições ou uma renderização concorrente.
- A consulta de dispositivos usa somente o comando de ajuda de um utilitário do pacote; ela não carrega o Parakeet nem inicia uma segunda transcrição.
- Qwen e Parakeet continuam no ambiente de avaliação, sem opções falsas na interface. Integrá-los requer adaptadores de tempos, cancelamento, progresso, vídeos longos e empacotamento testados.

O ambiente de desenvolvimento recebeu o pacote CUDA em `.tooling/vendor/whisper/gpu/Release`. O instalador de distribuição ainda precisa incluir/configurar seus próprios recursos. O ambiente de avaliação com Python, caches e cópias de modelos não é o tamanho do aplicativo distribuído.

## Proveniência e reprodução

- [Release oficial whisper.cpp b5454](https://github.com/ggml-org/whisper.cpp/releases/tag/b5454), pacote win-cuda-12.4.0-x64. SHA256 publicado e conferido: `afef0b881c500958921c3f5523b50e59ee2ec9b6f5cbd25b324c51ed308a957a`.
- [Whisper Large v3 convertido](https://huggingface.co/ggerganov/whisper.cpp/blob/main/ggml-large-v3.bin): 3.095.033.483 bytes. SHA256 LFS publicado e conferido: `64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2`.
- [Parakeet convertido pelo ggml-org](https://huggingface.co/ggml-org/parakeet-GGUF/blob/main/ggml-parakeet-tdt-0.6b-v3-f16.bin): 1.255.897.319 bytes. SHA256 LFS publicado e conferido: `833bffc9513b2cae867ee9e51633cfd11e4d51aaa5597c8ac02159385a2b426f`.
- Qwen revisão `7278e1e70fe206f11671096ffdd38061171dd6e5`; Systran Large v3 `edaa852ec7e145841d8ffdb056a99866b5f0a478`; mobiuslabsgmbh Turbo `0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf`.
- Roteiro reproduzível: `tools/asr/benchmark.py`; consolidação: `tools/asr/export_results.py`; entradas e logs reais em `.tooling/vendor/asr-evaluation/`.
- Duas tentativas iniciais do faster-whisper falharam antes da decodificação por incompatibilidade com PyAV 19. A entrada passou a usar PCM float32 via soundfile; somente esses dois casos foram repetidos e concluídos.

Fontes de implementação: [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [Qwen3-ASR](https://github.com/QwenLM/Qwen3-ASR), [PyTorch para Windows/CUDA](https://pytorch.org/get-started/locally/).
