# Plano — Tela de envio e ferramentas 03C

Implementar a entrada solicitada com base nos frames atuais lidos no MCP FigCraft. Escopo e aceites: `docs/product/UPLOAD-SCREEN.md`. Direcionamento adicional de 2026-10-19: concluir também preparação demonstrativa, visão do projeto e editor antes de conectar os motores de IA.

1. Reconectar FigCraft e ler frames atuais; registrar geometria e conteúdo.
2. Introduzir rota de envio e seleção própria no sidebar; preservar Home e biblioteca.
3. Implementar seleção/validação de vídeo e diálogo das ferramentas, com configurações de legendas e limites reais do pipeline.
4. Exibir projetos recentes reais; fechar estados, teclado e responsividade.
5. Executar build, unitários e runtime isolado proporcionais; revisar diff; registrar documentação e relatório.

6. Conectar a entrada à criação real de projetos e à navegação da biblioteca/recentes.
7. Implementar visão do projeto, título editável e transcrição identificada como demonstração.
8. Implementar editor: prévia real local, referência YouTube, transcript/search, timeline/seek, proporção, texto, áudio e salvamento de configurações. Exportação e IA permanecem indisponíveis.

Sem backend de processamento, novas dependências, commits ou deploy. Renomeação de projeto utiliza o storage existente. Os prints do OpusClip são estudo de fluxo, não identidade visual. Documento FigCraft próprio de exploração identificado como DRAFT; mantenedor aprova o visual. Nova rodada de validação proporcional para este escopo ampliado, com no máximo uma repetição por falha.

## Correção 03E

1. Rever referências oficiais e corrigir a entrada: novo projeto → envio → visão do vídeo.
2. Trocar título por caneta; reconexão apenas para mídia ausente; retirar preparação simulada.
3. Limitar prévia pela altura, fixar áreas do editor e melhorar timeline com quadros reais.
4. Validar fluxo e geometria sem screenshots, atualizar contrato/rastreabilidade e relatório.

## Refinamento 03F

1. Ajustar foco/cursor com indicação de teclado preservada.
2. Abrir estilos de legenda em modal reutilizando diálogo existente.
3. Registrar estado e proposta de integração do motor para ZCode.
4. Build e runtime focado, sem reexecutar aprovados da 03E.

## Correção M2A pós-entrega

1. Corrigir parsing de caminhos e nome novo/legado; remover imports Rust não usados.
2. Bloquear novo projeto de referência YouTube como importação, preservar registros antigos com aviso.
3. Repassar progresso/erros de importação e restringir drop ao formulário ativo.
4. Unitários relacionados, Rust pertinente/check de warnings, build e até duas rodadas runtime conforme política.

## M3A — transcrição local inicial

1. SPEC e inventário; download oficial CPU/Base com hashes, apenas no workspace.
2. Módulos separados de parser, ferramentas, processos, jobs, execução, persistência e comandos.
3. Geração/cancelamento, busca/seek existentes, hidratação e edição salva por projeto.
4. Testes em código e compilação. Mantenedor reservou runtime/fluxo ao seu teste manual; roteiro em M3A-MANUAL-CHECK.md.
5. Relatório sem alegar benchmark ou conclusão de M3/exportação; nenhum commit.

## Correção M3A — feedback e posições

1. Consultar UX Writing e fontes oficiais do whisper.cpp/Whisper; separar relato do usuário de causa efetivamente comprovada.
2. Adaptar segmentos externos sem relaxar a validação canônica; regressões de tempo nulo, borda e ordem.
3. Consumir callback oficial de porcentagem e abrir modal existente; retirar ruído interno/roadmap.
4. Testes determinísticos e markup em Node, build e revisão; sem navegador/app. Uma rodada + repetição somente para falha/impacto novo.

## Refinamento do editor e transcrição

1. Contratos oficiais de tokens do whisper.cpp e UX Writing; nenhuma informação interna nova na UI.
2. Painel contínuo limitado; limpeza de diálogo e destaque com offsets reais; edição descarta alinhamento antigo.
3. Timeline com pointer capture/teclado, miniaturas e onda FFmpeg reais em cache; responsabilidades separadas.
4. Small baixado e hash conferido; padrão provisório, benchmark e qualidade humana pendentes.
5. Verificação em código: 52 Rust e 97 frontend únicos aprovados; build e TypeScript aprovados. Erro inicial de literal Rust corrigido e módulo revalidado. Sem navegador/app; roteiro EDITOR-TIMING-MANUAL-CHECK.md.

## Correção 03H — uso e coerência do editor

1. SPEC e skills de frontend/UX Writing; estudar referência do mantenedor e contrato nativo de tokens.
2. Seções recolhíveis e palavra com seek/correção; preservar intervalo ao corrigir palavra e invalidar somente edição livre de trecho.
3. Corrigir fronteira instantânea no parser, usar DTW nativo e Large v3 Turbo verificado; sem prometer precisão ou informar modelo na UI.
4. Onda real com maior densidade/canvas e Cancelar secundário existente.
5. Exclusão confirmada, original/compartilhamento/exports preservados, retomada de exclusão interrompida; bloquear contexto nativo sem parar eventos do app.
6. Testes de código: 164 casos únicos (58 Rust, 106 frontend), build PASS. Revalidação focada após revisão de popover/falha de arquivo; teste novo de retomada. Sem app/navegador. Roteiro EDITOR-USABILITY-MANUAL-CHECK.md.

## 03I — controles de edição e menu de projeto

1. Preservar ASR/área de transcrição aprovados; remover avisos persistentes e refinar scrollbar sem mudar identidade.
2. Contexto nos cards com teclado, foco, ações reais de arquivo/coleção/exclusão. Mantenedor adiou compartilhamento.
3. Estilos/fontes/efeitos de legenda opcionais, validados e persistidos, usando o mesmo render no sample/vídeo; nenhum novo pacote de fonte.
4. Transporte com início/play/pause/fim e Espaço guardado para campos/diálogos.
5. Testes em código: 61 Rust e 117 frontend únicos aprovados; build PASS. Repetição focada após revisão de diálogos e salvamento reativo, sem app/navegador.

## 03J — editor e cortes automáticos

1. SPEC/PLAN: EDITOR-AUTOCUT-SPEC.md; reutilizar ASR/FFmpeg locais, preservar UI/Home.
2. BUILD: janela não modal móvel, ferramentas/ícones, clique/teclado, proporção/foco,
   cancelamento confirmado e progresso limitado ao medido; cortes/revisão/render modular.
3. TEST: 127 frontend e 73 Rust únicos PASS; MP4 sintético real verificado por ffprobe
   e pixels da legenda; build PASS. Falhas iniciais e repetições focadas documentadas.
4. REVIEW: web-design-guidelines e code-review-and-quality por código; sem estética
   autônoma ou app/navegador. EDITOR-AUTOCUT-REVIEW.md registra correções/limites.
5. Pendentes: conferência manual, qualidade dos ganchos reais, benchmark ASR,
   versões/lote/instalador. Zero commits/pushes.
