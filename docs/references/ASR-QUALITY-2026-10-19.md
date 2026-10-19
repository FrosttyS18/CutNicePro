# Qualidade de transcrição — consulta em 2026-10-19

O mantenedor aprovou qualitativamente a melhora obtida com Large v3 Turbo.
Nenhum benchmark novo foi executado nesta tarefa. Não há base para prometer
que uma troca elimine os erros de fala do vídeo real.

Alternativas verificadas em fontes primárias:

- OpenAI Whisper Large v3 completo: decoder maior; alternativa para comparação
  de precisão com maior custo de execução. whisper.cpp documenta 2,9 GiB para
  o modelo completo e 1,1 GiB quantizado Q5. A versão Turbo reduz o decoder de
  32 para 4 camadas, priorizando velocidade com perda de precisão variável.
  https://github.com/openai/whisper/discussions/2363
  https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md
- Qwen3-ASR-1.7B: modelo aberto alternativo com português; seu ForcedAligner-0.6B
  também suporta português. Integração é diferente do whisper-cli atual e exige
  avaliar runtime, memória, CPU/GPU e alinhamento na mesma amostra.
  https://github.com/QwenLM/Qwen3-ASR
  https://arxiv.org/abs/2601.21337

Decisão: manter o Turbo que recebeu aprovação qualitativa; não substituir um
motor funcional por alegação de ranking geral. Próxima comparação deve usar
o mesmo áudio pt-BR e referência corrigida pelo mantenedor, contabilizar erros
e qualidade dos tempos por palavra, tempo e memória. Estes modelos não foram
baixados nem testados nesta tarefa. Nenhum nome de modelo entra na UI.

Ícones Phosphor React, licença MIT: família consistente para ferramentas,
imports individuais conforme recomendação oficial para evitar compilar o
catálogo inteiro. https://github.com/phosphor-icons/react

Renderização usa FFmpeg/ASS e progresso out_time_us real:
https://ffmpeg.org/ffmpeg-filters.html
https://ffmpeg.org/ffmpeg-doc.html
Poppins: arquivos oficiais e OFL incluídos em app/src-tauri/resources/fonts.
https://github.com/google/fonts/tree/main/ofl/poppins
