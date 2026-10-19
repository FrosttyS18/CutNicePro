# Teste do mantenedor — transcrição local

Complemento vigente para texto contínuo, palavras e timeline: `EDITOR-TIMING-MANUAL-CHECK.md`. Este roteiro preserva os testes básicos da entrega inicial.

Reinicie o Tauri dev para carregar o backend novo. Nenhum teste de navegador ou abertura automática do aplicativo foi executado nesta entrega.

1. Importe um vídeo curto com fala clara em português. Abra o projeto e clique em **Transcrever em português**, na seção Transcrição. Se houver alterações pendentes, salve primeiro.
2. Confira os estados de preparação do áudio, transcrição e conclusão. O app não apresenta percentual estimado. Verifique se o texto corresponde ao áudio.
   O processamento abre um modal com porcentagem e Cancelar. A porcentagem vem do reconhecimento; pode ficar em 0% durante a preparação e avançar em passos, sem simulação. O modal fecha após o resultado ser salvo. Confira também a porcentagem durante a importação.
3. Busque uma palavra, clique no tempo do trecho e confirme o salto no player. Abra o editor/Legendas e confira a mesma transcrição e sua prévia.
4. Edite um trecho, salve, feche e reabra o app. Confirme que texto corrigido, vídeo e configurações continuam presentes.
5. Clique em **Transcrever novamente** e cancele. O texto anterior deve permanecer. Outra tentativa deve ser possível.
6. Um vídeo sem áudio deve mostrar diagnóstico e bloquear a transcrição. Navegar para outro projeto durante um job não pode trocar seus textos.

O modelo Base é a primeira opção de desenvolvimento, ainda sem aprovação de qualidade. Não há download de YouTube, exportação MP4/SRT nem instalador do motor nesta entrega. Os binários/modelo estão apenas na pasta ignorada `.tooling/vendor/whisper`; builds distribuídos precisam de instalação própria, tratada em etapa posterior.
