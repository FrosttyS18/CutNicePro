# CutNicePro — handoff para o motor

Estado: 03F, 2026-10-19. Documento de continuidade técnica; escolhas de runtime/modelo são pendentes. Não autoriza instalar componentes ou enviar vídeos a provedores. Mantenedor realizará a próxima etapa com ZCode. Home aprovada; demais telas PENDING HUMAN APPROVAL.

## Fluxo vigente

1. Home → Criar projeto, ou Meus Projetos → Novo projeto, abre Enviar vídeo.
2. Envio geral aceita um arquivo e abre a visão daquele vídeo: player, título com caneta, transcrição e ações. Não abre seletor de ferramentas nem cria pasta vazia.
3. Ferramentas na tela de envio são atalhos explícitos; Coleções organiza projetos importados.
4. Editar vídeo abre editor; Legendas abre modal de estilos. Selecionar um estilo atualiza configuração; Concluir ou Escape fecha e devolve foco.
5. Salvar guarda configurações da prévia; Exportar abre configuração, mas render ainda está indisponível.

Destino com motor: importar → analisar mídia/transcrever com estado real → abrir visão do projeto com transcrição real → editar → exportar. Em falha, projeto e mídia permanecem acessíveis com causa e ação. Definir a política de jobs antes de inserir espera automática na navegação; não voltar aos timers artificiais da 03D.

## Implementado e comprovado no escopo registrado

- Metadados de projeto e coleções no Rust; criar, abrir e renomear via IPC existente.
- Arquivo local: inspeção de metadados, player, seek, áudio e 12 miniaturas extraídas do vídeo.
- Editor: limites de viewport, texto/proporção/layout de prévia, intervalo de reprodução, zoom e cursor da timeline.
- Legendas: modal com modelos0–9, opção sem legenda e escolha persistida. São prévias estáticas de estilo, não animações de palavra/karaokê nem render final.
- Configurações salvas em localStorage por ID. Objetos File e URLs ficam apenas na sessão. Reiniciar exige reconectar o arquivo.
- YouTube: link validado e iframe de referência; não baixa mídia, não alimenta timeline local nem gera transcrição.
- Transcrição nova vazia. Dados demonstrativos antigos podem existir no armazenamento v1, identificados como demo.
- Nenhum motor de IA, fila real, extração de áudio, waveform, corte multitrack ou exportação final conectado.

## Pontos de integração existentes

| Arquivo | Papel / cuidado |
| --- | --- |
| app/src/App.tsx | handleCreateFromMedia cria metadados, associa mídia da sessão e abre overview. Tornar importação transacional ao adicionar armazenamento real. |
| app/src/lib/video-source.ts | Validação e inspeção browser; não substitui análise no backend. |
| app/src/services/workspace-store.ts | Cache v1 localStorage e mídia por sessão; não é repositório de arquivos persistentes. |
| app/src/hooks/useWorkspaceData.ts | Carregar, editar, salvar e reconectar mídia; preservar títulos/configurações na migração. |
| app/src/lib/workspace-types.ts | TranscriptSegment usa segundos; transcriptMode aceita somente demo/empty. Adicionar estado real com migração e validação. |
| app/src/components/workspace/TranscriptPanel.tsx | Busca/edição de trechos e navegação temporal. Não altera áudio/vídeo atualmente. |
| app/src/components/editor/VideoEditor.tsx | Playback e ajustes visuais; intervalo limita reprodução, não exporta. |
| app/src/components/editor/CaptionPresetsDialog.tsx | Presets mantêm IDs0–9; amostra estática independente da geração de transcrição. |
| app/src/components/upload/PreparationDialog.tsx | Busy/erro/retry da criação atual; conectar a eventos reais, sem percentuais inventados. |
| app/src-tauri/src/storage.rs e lib.rs | Persistência e comandos existentes; ampliar de modo aditivo. |

## Ordem proposta para o ZCode

1. Inventariar hardware, ferramentas locais, licenças, armazenamento e decisões canônicas. Consultar Graphify se disponível; índice ausente não é evidência arquitetural. Rever EPIC-001/002/005/011, DEC-012/013 e respectivas BR/AC no backlog antes de escolher runtime/modelo.
2. Importação persistente: estratégia de cópia ou referência autorizada, integridade, arquivo movido/ausente, paths seguros e leitura da mídia via Tauri. Migrar v1 sem perder configurações; não persistir object URLs.
3. Análise de mídia e áudio: duração/streams reais, formatos suportados, cancelamento, arquivos inválidos e limites de recurso. Definir distribuição/atualização de binários com documentação oficial e licenças verificadas.
4. Jobs: estados enfileirado/em execução/concluído/falhou/cancelado, estágio real, logs sem dados sensíveis, cancelamento e recuperação após reinício. Percentual só quando mensurável. Execução sequencial é proposta canônica, não motor já implementado.
5. Primeira fatia real: arquivo local → áudio → transcrição local → segmentos com timestamps → salvar → reabrir. Escolher modelo após teste de capacidade e qualidade; não baixar múltiplos modelos sem necessidade.
6. Integrar transcrição à busca, seek e legenda. Preservar diferença entre correção textual, alteração de tempo e corte de mídia. Timestamps de palavra só se o motor fornecer esse contrato.
7. Render mínimo: um vídeo, intervalo válido, proporção, legendas e áudio. Exportar arquivo reproduzível; só então habilitar confirmação de exportação. Depois ampliar para clipes e demais ferramentas do backlog.
8. BYOK em fatia própria: provedor suportado, consentimento claro sobre envio externo, chave no armazenamento seguro do sistema, validação, erro/quota/custo. Nunca guardar chave em localStorage ou logs. Falha local não autoriza upload externo automático.
9. Importação YouTube em fatia específica: obtenção de mídia, erros e condições de uso; iframe atual não equivale a importação concluída.

## Critérios para considerar a primeira fatia funcional

- Importar um vídeo real, reiniciar o app e reabrir sem reenviar o arquivo quando a política de armazenamento permitir.
- Transcrever fala verificável; persistir resultado real e posições em segundos; buscar e navegar ao ponto correspondente.
- Cancelar/falhar sem deixar job preso ou projeto sem recuperação; nenhum falso sucesso.
- Exportar trecho curto com duração/proporção/áudio/legendas corretos; reproduzir o arquivo resultante.
- Validar no Tauri real as permissões, IPC, arquivos e processos. Testes de navegador com IPC simulado não substituem esse aceite.
- Testes proporcionais: uma rodada inicial e uma repetição justificada; preservar aprovados e respeitar VALIDATION-POLICY.md. Estética aprovada exclusivamente pelo mantenedor.

## Evidências e limites

03E: build, 30 unitários e 12 runtime únicos com IPC simulado. 03F: build e quatro casos runtime focados em modal, escolha salva, cursor/teclado, responsividade e console. Nenhuma destas evidências comprova IA ou exportação. Ver docs/reports/evidence/03e e 03f e relatórios de histórico.

Próximo passo recomendado: inventário técnico e implementação da primeira fatia de mídia persistente. Não redesenhar a Home nem reabrir decisões visuais aprovadas ao integrar o motor.

## Pesquisa de ferramentas de 2026-10-19

Comparação de 10 candidatos e ordem proposta em ../references/OPEN-SOURCE-ENGINE-RESEARCH.md. Manter stack atual; proposta inicial FFmpeg + avaliação whisper.cpp, com yt-dlp em etapa própria para links. Nenhum motor adicional instalado nesta pesquisa. Antes de copiar código, verificar licença e versão, inclusive modelos e dependências. Correções de UI M2A em evidence/m2a-fix têm validação runtime parcial por falha do harness e orçamento esgotado; não promovê-las a integração nativa aprovada.


## Continuidade M3A inicial (2026-10-19)

Transcrição local inicial implementada em módulos próprios, com whisper.cpp CPU/Base no desenvolvimento, cancelamento e persistência por projeto. Contrato: M3A-TRANSCRIPTION-SPEC.md; roteiro humano: M3A-MANUAL-CHECK.md; decisões e hashes: ENGINE-DECISIONS.md §5. Mantenedor restringiu validação a código, sem navegador/abertura do app. Não tratar ASR, qualidade ou M3 completo como aprovados: runtime e benchmark pendentes; exportação/YouTube/BYOK continuam fora desta entrega.

## Continuidade 03I (2026-10-19)

Large v3 Turbo/DTW preservados após relato positivo do mantenedor. Editor possui CaptionStyle opcional validado/persistido, visual de legendas compartilhado com predefinições/fonte/efeitos e transporte com Espaço. Menu de contexto nos cards exporta cópia da origem e TXT/SRT reais com seletor nativo; não é render MP4 com cortes/efeitos. Contratos/limites: EDITOR-CONTROLS-SPEC.md; testes somente em código, runtime reservado ao mantenedor. Compartilhamento explicitamente adiado. Não reintroduzir avisos internos na interface.
