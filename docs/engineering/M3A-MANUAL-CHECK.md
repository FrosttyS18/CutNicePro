# Teste do mantenedor — transcrição local

Revisão 03N: roteiro de continuidade sobre o código atual, sem teste manual executado nesta tarefa. Complementos de interação em EDITOR-USABILITY-MANUAL-CHECK.md e contratos vigentes em ENGINE-HANDOFF.md. Precisão da fala não está aprovada por testes de parser.

Reinicie o Tauri dev para carregar o backend novo. Nenhum teste de navegador ou abertura automática do aplicativo foi executado nesta entrega.

1. Importe vídeo curto com fala clara em português. Abra o projeto e use Transcrever nas Ferramentas; escolha contextual/processamento e salve alterações quando solicitado. Turbo é padrão; a retirada do Large completo ainda está pendente em DEC-014.
2. Confira preparação, porcentagem real e conclusão. O CLI fornece progresso por bloco e o runner calcula o global; a UI avança em inteiros até o último valor recebido. Preparação pode permanecer em 0%; 100% depende de salvar. Confira Cancelar/X com confirmação e porcentagem da importação medida em bytes.
3. Busque uma palavra, clique no tempo do trecho e confirme o salto no player. Abra o editor/Legendas e confira a mesma transcrição e sua prévia.
4. Edite um trecho, salve, feche e reabra o app. Confirme que texto corrigido, vídeo e configurações continuam presentes.
5. Clique em **Transcrever novamente** e cancele. O texto anterior deve permanecer. Outra tentativa deve ser possível.
6. Um vídeo sem áudio deve mostrar diagnóstico e bloquear a transcrição. Navegar para outro projeto durante um job não pode trocar seus textos.

O primeiro ciclo usou Base e não tinha exportação; esse limite é histórico. Código atual usa Turbo por padrão, checkpoints e exportação TXT/SRT/MP4 por operações próprias; não há download de YouTube ou instalador dos motores. Ferramentas ficam em `.tooling/vendor/whisper` no desenvolvimento. Para conferir retomada, interromper vídeo acima de um bloco concluído e repetir com mesma mídia/modelo/configuração; cancelamento não deve substituir o texto publicado anterior. A comprovação nativa delimitada da 03M está no REVIEW de confiabilidade, não constitui execução deste roteiro no aplicativo.
