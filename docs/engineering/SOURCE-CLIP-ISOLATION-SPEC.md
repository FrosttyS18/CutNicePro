# Correção 03L — original, clipes e análise

Estado: IN REVIEW. Autorização: /start do mantenedor em 2026-10-19.
Jornadas: JRN-003/006/007/008/009/010; FR-008/009/010/011/012/013/014/016/017/022; BR-019..023/026..031; AC-040..045, extensão incremental da 03K, sem aprovação estética implícita.

## SPEC

Atualização documental 03N: isolamento/formato implementados não comprovam preenchimento adequado. `isolatedClipSettings` aplica contain aos clipes novos sem edição salva, mesmo em 9:16. O mantenedor rejeitou esse resultado com faixas e a linguagem técnica da análise; ambos são defeitos abertos, não aceites concluídos por persistir o ratio ou validar citações. Critérios complementares no BACKLOG/PRD. BR-03L-03 continua descrevendo o legado; não autoriza aplicar crop indiscriminado à origem ou a ajustes salvos. DEC-014 registra Turbo como escolha e retirada do Large completo ainda pendente.

- BR-03L-01: a visão do projeto reproduz a mídia original, sem proporção, texto, legenda, volume ou enquadramento do editor.
- BR-03L-02: cada corte conserva seu formato de geração e suas próprias edições; abrir um corte não altera o vídeo completo ou outro corte.
- BR-03L-03: cortes antigos sem formato explícito usam a proporção suportada mais próxima da origem, com ajuste sem recorte, nunca a última proporção editada. A prévia original conserva as dimensões exatas da origem.
- BR-03L-04: análise semântica deve citar evidências presentes na fala, sem alegar análise visual ou tendência. Ausência/falha do modelo é estado de erro, não análise genérica.
- BR-03L-05: referência Opus é comparação imperfeita; correções confirmadas pelo mantenedor não autorizam substituição global de palavras.
- AC-03L-01: prévia original permanece na proporção da mídia após edição vertical.
- AC-03L-02: formato escolhido na geração persiste e alimenta galeria, inspeção, edição e exportação.
- AC-03L-03: miniatura preserva a geometria do quadro, sem limite de altura distorcendo a proporção.
- AC-03L-04: inspeção apresenta transcrição em parágrafos, espaços explícitos e seek por palavra, com rolagem limitada.
- AC-03L-05: escolha de modelo é compacta, acessível e coerente com o modal de processamento.
- AC-03L-06: análise resume o assunto e fundamenta os critérios no trecho; dados antigos podem ser analisados sem gerar novos intervalos.

## PLAN

1. Isolar prévia original, configurações do vídeo completo e configurações por corte.
2. Persistir formato nos cortes e apresentar escolha explícita na geração.
3. Compactar seletor e reorganizar transcrição da inspeção.
4. Integrar análise local semântica com validação de evidências e cancelamento.
5. Comparar Whisper com referência imperfeita e âncoras humanas; só aplicar mudanças sustentadas por resultados.

## TEST

Uma rodada inicial de testes relacionados TS/Rust, build e execuções reais delimitadas dos motores. Uma repetição apenas para falhas ou mudanças adicionais justificadas. Sem abrir/automatizar app ou navegador. Aprovação estética exclusiva do mantenedor.

Contratos: isolamento entre original/vídeo/cortes, legado sem formato, persistência e recarga, formato de saída, agrupamento de palavras sem perda de tempo, rejeição de análise com evidência inventada. Qualidade ASR e análise semântica exigem execução real; compilação isolada não valida qualidade.
