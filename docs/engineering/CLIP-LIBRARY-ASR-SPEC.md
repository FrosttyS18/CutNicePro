# Biblioteca de clipes e avaliação de transcrição

Estado: IN REVIEW — 2026-10-19. Escopo autorizado no chat com /start.

Revisão documental 03N: comparação de quatro modelos abaixo é escopo histórico já registrado, não ordem para instalar/retestar todos. Turbo é padrão no código e escolha atual do mantenedor; retirada de Large completo decidida em DEC-014, ainda pendente na UI/backend. Qwen3-ASR/Parakeet continuam avaliados, não integrados ao produto. Preservar resultados anteriores e transcrições existentes.

## Jornada e critérios

- A biblioteca existente mantém Todos para projetos e Clipes para cortes de todos os projetos. Contagens vêm dos dados salvos.
- Cortes dentro de um projeto abre uma tela dedicada somente aos cortes dele. Nenhuma lista adicional abaixo da transcrição.
- Um corte abre inspeção com reprodução limitada ao trecho, legendas, transcrição, critérios existentes, aprovação e edição/exportação.
- Títulos devem considerar o conteúdo do trecho; não publicar métricas de tendência sem evidência externa.
- Relato posterior do mantenedor: resumo/análise atual ainda usa metalinguagem técnica; alvo é narrativa concreta do conteúdo. Formato 9:16 salvo ainda não preenche o quadro devido a contain; composição deve ser validada separadamente. Defeitos de conteúdo/composição continuam abertos no BACKLOG.
- Controles seguem o design existente: ação principal branca, texto preto, foco de navegação por teclado, fechamento centralizado e seletores personalizados acessíveis.
- Avaliar Turbo, Large v3, Qwen3-ASR 1.7B e Parakeet v3 na mesma amostra real, em sequência. Registrar motor, dispositivo, duração, tempo e falhas. Não inferir precisão sem referência humana.
- Modelos permanecem arquivos independentes; uma execução deve carregar somente o modelo selecionado.

## Plano e validação

1. Inspecionar contratos existentes e hardware; preparar motores isolados no diretório ignorado de ferramentas.
2. Corrigir componentes compartilhados e navegação, reutilizando persistência e processamento atuais.
3. Executar comparação real dos motores disponíveis, sem enviar áudio a serviços externos.
4. Compilar e executar testes pertinentes. Não automatizar a interface do aplicativo. Aprovação visual permanece com o mantenedor.

Rastreabilidade: extensão incremental da jornada de projeto/edição e requisitos de cortes em EDITOR-AUTOCUT-SPEC.md; sem alteração de autenticação, armazenamento remoto ou compartilhamento.
