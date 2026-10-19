# Conferência do mantenedor — 03H

Estado: PENDING HUMAN APPROVAL. Sem navegador ou app controlado pelo agente.

1. Reinicie o Tauri dev. Abra Projetos: cada card tem uma lixeira separada do botão que abre o vídeo.
2. Abra um projeto e inicie a transcrição. Confira Cancelar com o mesmo estilo secundário do projeto e teste o cancelamento.
3. Use **Transcrever novamente** para aplicar o novo reconhecimento e alinhamento. Na conclusão, abra o editor e reproduza além do primeiro minuto; confira palavra ativa, pausas e precisão da fala.
4. A transcrição deve aparecer em seções com título e duração. Abra/recolha seções e busque uma palavra. Acompanhar a reprodução abre a seção correspondente, preservando scroll interno.
5. Clique numa palavra: confira o salto ao áudio e a ação **Editar palavra**; também teste duplo clique, Salvar, Cancelar, Escape e teclado. Corrija, salve o projeto e reabra: confira texto e navegação da palavra seguinte. Edição livre de trecho continua disponível na caneta.
6. Confira miniaturas e onda de áudio; o primeiro acesso atualiza o cache. Teste zoom e cursor pela régua/fora da faixa. Compare janela normal e ultrawide.
7. Clique com botão direito no vídeo, texto e biblioteca: o menu padrão do navegador não deve abrir.
8. Em um projeto de teste, escolha **Excluir projeto**. Cancele primeiro e confira preservação. Confirme depois: deve sumir da lista e da coleção; a origem e exports devem continuar no disco. Se a mídia for compartilhada, o outro projeto deve continuar abrindo.

Seções usam títulos extraídos da fala e limites por pausa/duração; classificação semântica de ganchos ainda não é implementada. Large v3 Turbo está instalado no workspace, sem envio de mídia externo. Precisão e velocidade do reconhecimento neste vídeo ainda precisam desta conferência. Essas informações permanecem na documentação, não na interface.
