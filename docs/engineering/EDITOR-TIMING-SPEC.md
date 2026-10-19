# Refinamento funcional do editor e da transcrição

Contrato histórico 03G. Agrupamento, edição por palavra, modelo e onda foram substituídos pela 03H em `EDITOR-USABILITY-SPEC.md`, ainda IN REVIEW pelo mantenedor.

Solicitação 2026-10-19: conter a transcrição, simplificar leitura, remover marcadores de diálogo, sincronizar palavra com áudio, corrigir arraste e mostrar miniaturas/onda reais. JRN-006/009; FR-008/011/012; BR-020/025/026 e aceites de navegação/edição existentes. Referências: prints fornecidos do Opus, componentes e tokens atuais. Sem copiar marca nem introduzir controles sem função.

Contrato: transcrição em texto contínuo, altura limitada com scroll interno; editar trecho sob seleção, busca e clique por palavra. Palavra acende apenas com tempos fornecidos pelo CLI, sem divisão proporcional inventada. Legado sem palavras mantém navegação por trecho e oferece retranscrição. Editar texto invalida alinhamento anterior desse trecho.

Timeline: régua + miniaturas e picos de áudio reais cacheados pelo hash da mídia; erros e carregamento explícitos. Cursor é um slider acessível cobrindo régua e faixas, com pointer capture para arraste fora dos limites; teclado, Home/End e clamp. O editor preserva prévia e timeline visíveis por altura; painel do texto tem scroll próprio.

ASR nesta entrega histórica: Small multilíngue substituiu Base; JSON completo do whisper.cpp forneceu tokens agrupados em palavras. Revisão documental 03N: o padrão atual é Turbo com DTW; Small/Base não são escolhas vigentes do produto. Large completo ainda é suportado no código, com retirada decidida em DEC-014. Preservar transcrições e evidências históricas; nenhuma promessa de equivalência ao Opus. O escopo de testes em código desta fase não comprova qualidade linguística ou aprovação visual; ver M3A-TRANSCRIPTION-SPEC e ENGINE-HANDOFF para a execução atual.

Direcionamento adicional: mantenedor rejeitou qualquer aviso na UI sobre modelo, migração ou necessidade de gerar tempos novos. Esses detalhes ficam apenas nesta documentação e no roteiro de teste. Nenhum aviso desse tipo foi mantido na transcrição.

Implementação: FFmpeg gera 24 JPEGs 160×90 por busca no arquivo e PCM mono de 1 kHz para 600 picos; cache por hash da mídia em app-data/cutnicepro/previews. Processos próprios são rastreados e encerrados ao fechar; temporários pertencem somente ao job. Não se gera onda ou imagem fictícia. Small: 487.601.967 bytes, SHA-256 1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b, baixado e conferido em .tooling/vendor/whisper/models. Setup reproduzível atualizado; sem mudança no PATH. Fonte do modelo: https://huggingface.co/ggerganov/whisper.cpp . Fonte do contrato de tokens/flags: https://github.com/ggml-org/whisper.cpp/blob/v1.9.5/examples/cli/cli.cpp .
