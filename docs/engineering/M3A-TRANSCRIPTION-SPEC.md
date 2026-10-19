# M3A — transcrição local inicial

Estado: IMPLEMENTING. Jornada JRN de importação → projeto → edição; requisitos FR-012/013 e backlog M3/US-012/013, conforme ENGINE-HANDOFF.

Escopo: vídeo local persistido → áudio PCM mono 16 kHz → whisper.cpp CPU, modelo Base multilíngue, idioma pt → segmentos reais em segundos → armazenamento por projeto → busca, seek e edição existentes. Exportação e download de YouTube continuam fora desta fatia.

Motor e modelo ficam em `.tooling/vendor/whisper` no desenvolvimento. Nenhum vídeo sai da máquina. Distribuição dos binários/modelos ao usuário final e escolha definitiva do modelo dependem de etapa posterior. Modelo inicial não representa benchmark de qualidade aprovado.

Implementação separa contratos/parser, descoberta das ferramentas, processos canceláveis, jobs, persistência, execução e comandos. Apenas um job de transcrição por vez. Cancelar encerra o processo filho e preserva o resultado anterior. Fechamento da janela encerra o filho. Falhas mostram causa; ausência de fala permite resultado vazio. Não existe percentual fictício.

Critérios: saída com texto real em português; timestamps válidos em segundos; reabertura recupera resultado e edições salvas; cancelar e falhar preservam resultado anterior e limpam temporários. Testes automatizados de contratos, parser, armazenamento e processo. Direcionamento do mantenedor durante a execução: não usar navegador nem abrir o aplicativo; runtime, fluxo e qualidade da fala serão testados por ele. Validação inicial + uma repetição justificada, sem screenshots. Aprovação estética e qualidade humana permanecem pendentes.

## Correção após teste do mantenedor — 2026-10-19

Relato: ausência de porcentagem/modal, termos internos na UI e rejeição do resultado por posições inválidas. O JSON do vídeo que falhou não está disponível: a causa individual daquele segmento não foi comprovada. Não declarar esse vídeo aprovado por testes sintéticos.

Contrato corrigido:
- CLI oficial continua executando o reconhecimento. `-pp` ativa seu callback nativo; o adaptador lê incrementalmente `whisper_print_progress_callback: progress = N%` do stderr. Eventos incluem `progress` inteiro. Não há relógio, interpolação nem percentual ponderado inventado. Preparação começa em 0%; valores intermediários vêm do CLI; 100% exige persistência bem-sucedida. Cancelamento bloqueia atualizações tardias.
- Modal com porcentagem, barra acessível, etapa atual e Cancelar. Falha exibe causa/ação em linguagem de produto e Tentar novamente. Importação também mostra porcentagem baseada em bytes reais. Interface omite nomes de modelo/binário, roadmap e exportação indisponível, conforme cutnicepro-ux-writing §6.
- Saída externa e dado canônico têm contratos distintos: ignorar trechos instantâneos/vazios segue o Whisper original; intersectar intervalos com a duração real e ordenar pelos próprios tempos permite importar trechos válidos sem inventar posições. Intervalos negativos/invertidos e resultado integralmente fora do vídeo continuam falhando; validação do dado salvo fica estrita (`0 ≤ start < end ≤ duração`). Tolerância anterior de 50 ms removida. Não há aumento de tolerância para obter PASS.
- Referências primárias: https://github.com/ggml-org/whisper.cpp/blob/v1.9.5/examples/cli/cli.cpp (callback e offsets JSON em ms); https://github.com/openai/whisper/blob/main/whisper/transcribe.py (remoção de segmentos instantâneos/vazios).

Validação: regressões determinísticas para saída com trecho instantâneo, borda final, ordem, dados inválidos, leitura fragmentada do callback, progresso monotônico, cancelamento, markup de modal e conteúdo sem jargão. Renderização de componentes em Node, sem navegador/DOM/app; não constitui teste de layout nem de reconhecimento de fala. Mantenedor repete seu vídeo no Tauri dev após reiniciar o backend.
