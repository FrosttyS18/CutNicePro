# Biblioteca e modelos — revisão técnica 03K

Estado: IN REVIEW. FUNCTIONAL STATUS: PARTIAL. REGRESSION STATUS: PASS no escopo de código testado. VISUAL STATUS: PENDING HUMAN APPROVAL.

Nota 03N: revisão e testes abaixo são históricos da 03K. A escolha atual do mantenedor é Turbo; suporte a Large completo ainda existe no código e sua retirada está pendente em DEC-014. Não promover comparações anteriores a precisão universal nem apresentar alternativas avaliadas como integradas. Estado operacional e defeitos de análise/composição no ENGINE-HANDOFF e BACKLOG.

## Implementação

Biblioteca: aba Clipes já existente → leitura dos cortes persistidos de todos os projetos → galeria compartilhada → inspeção. Projeto → Cortes → galeria filtrada pelo projeto. A lista adicionada abaixo da transcrição foi removida. A consulta global não depende do workspace em localStorage. A inspeção lê mídia e transcrição persistidas; abrir edição recompõe a fonte se as preferências locais estiverem ausentes.

Galeria apresenta frames do vídeo verdadeiro, duração, título, projeto, nota estimada e revisão. Inspeção limita reprodução ao intervalo, oferece controles e Espaço, mostra legenda sincronizada, transcrição com seek por palavra, abertura/fechamento, razões existentes, aprovação e exportação. Não há nota de tendência nem promessa de viralização.

Títulos usam frases representativas do conteúdo inteiro do corte, com termos recorrentes e relevância no vídeo. É extração de conteúdo, não resumo generativo por um modelo de linguagem. Títulos legados reconhecidos como o antigo prefixo de 12 palavras são atualizados na apresentação somente com fingerprint correspondente; revisão persiste o título atualizado. Textos personalizados são preservados.

Transcrição: dois perfis Whisper disponíveis; um processo, um arquivo de pesos e um alinhamento por execução. CUDA instalado em diretório separado, sem substituir a alternativa CPU. Sondagem de GPU sem carregar modelos; opção explícita de CPU; falha de memória orienta nova tentativa com processador. Qwen e Parakeet apenas avaliados, sem integração fictícia na UI.

## Verificação de código

- 136 casos únicos frontend aprovados entre rodada inicial e repetições focadas, sem somar casos repetidos.
- 79 casos únicos Rust aprovados: suíte de 77; um contrato real ASR executado explicitamente; um caso novo de isolamento de projetos. A suíte de 77 inclui integração FFmpeg real com vídeo sintético.
- Dez casos ASR reais concluídos, quatro modelos, CPU/GPU, amostra de 30 segundos. Não são dez testes unitários.
- Build TypeScript/Vite aprovado. Permanece o aviso de bundle acima de 500 kB.
- Baseline estrutural fast: quatro PASS, dois SKIP. Suítes já verificadas não repetidas pela baseline.
- Nenhuma automação/abertura da UI Tauri, captura de tela ou aprovação estética nesta tarefa. Sem WER/CER e sem teste físico em placa com menos de 8 GB.

Falhas iniciais corrigidas: uso de Array.at fora do alvo TypeScript; mocks sem o novo campo profiles; expectativa antiga do botão secundário; remoção de listener com semântica incompatível no EventTarget do Node; incompatibilidade PyAV; consulta --help do Whisper que sai antes de carregar os dispositivos. A consulta CUDA foi corrigida e confirmada com o teste real explícito.

## Revisão web-design-guidelines por código

Fonte consultada em 19/10/2026: [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md). Escopo funcional, sem auditoria estética.

- `app/src/components/AppSelect.tsx:54` — lista personalizada no top layer, foco composto com aria-activedescendant, setas/Home/End/Enter/Escape/Tab e pesquisa inicial; fechamento em clique externo, rolagem externa e resize. Ícone decorativo e espaço lateral definidos. Interação no WebView permanece para conferência humana.
- `app/src/components/ColorControl.tsx:8` — paleta e campo de cor identificados; nenhum type=color ou caixa do navegador. Campos de cores separados dos labels com múltiplos controles.
- `app/src/lib/input-modality.ts:1` e `ui.css` — foco de teclado preservado; ponteiro não mostra contorno de foco. Listeners removidos com a mesma opção de captura.
- `app/src/components/clips/ClipGallery.tsx:14` — estados de carregamento, erro, vazio e filtros; mídia carregada ao aproximar da viewport; listas usam content-visibility; nota identificada como estimativa.
- `app/src/components/clips/ClipInspection.tsx:40` — vídeo com transcrição e controles identificados; atalhos restritos à janela e fora de campos; limites do corte; reprodução impedida pelo atalho durante processamento. Hover/foco e rolagem seguem controles compartilhados.
- `app/src/components/workspace/ProcessingDialog.tsx:42` — Cancelar branco com texto preto e centralizado; X vetorial centralizado. Fluxo de confirmação continua compartilhado com Escape e Cancelar.

## Limitações e continuidade

A precisão dos modelos e a qualidade editorial dos títulos/ganchos dependem de revisão humana. Não foi introduzido modelo generativo de análise audiovisual ou fonte externa de tendências. Estilos permanecem na persistência atual do projeto; versões independentes de edição por corte e histórico não foram adicionados nesta tarefa.

Interface real, navegação completa, comportamento do popover no WebView e exportação pelo seletor do sistema ainda precisam de conferência do mantenedor. O empacotamento dos motores para distribuição permanece separado do ambiente de avaliação. Graphify/FigCraft não estavam expostos como ferramentas; análise realizada diretamente no código e documentação canônica. Compartilhamento continua adiado.
