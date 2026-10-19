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
