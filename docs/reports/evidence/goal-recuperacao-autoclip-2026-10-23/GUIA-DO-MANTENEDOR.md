# GUIA DO MANTENEDOR — testar a entrega (goal-recuperacao-autoclip, 2026-10-23)

O app está **aberto na sua tela** (se não estiver, me avise que eu abro de novo).
Deixei o projeto **"TXT Aceite Manual"** com 12 cortes reais para você testar sem esperar geração.

## 1. O que foi corrigido (confira em ~2 min)
- **Export/baixar** (o erro "Não foi possível processar o vídeo"): era meu arquivo de projetos corrompido + mídia sem vínculo — corrigido. Teste: **Cortes → card → Baixar → escolha a pasta → MP4 publicado**. O nome do arquivo agora é **"{projeto}-{título do corte}"** (identificável).
- **Biblioteca global** ("Meus Projetos → Clipes" zerado): um projeto quebrado escondia todos. Agora cada projeto é isolado; se algum falhar, os outros aparecem + aviso "Alguns projetos não puderam ser carregados (N)". Confira: **Meus Projetos → Clipes** — os clipes do davyjones e do TXT Aceite Manual devem aparecer juntos.
- **UI das ferramentas**: o checkbox "Gerar automaticamente quando a transcrição terminar" agora fica DENTRO do diálogo **"Gerar cortes"** (não mais solto entre botões); os botões do **projeto vazio** não estão mais colados; "Transcrever novamente" está alinhado na coluna.

## 2. Novidades para você ver (~3 min)
- **Badge "Novo"**: no projeto TXT Aceite Manual → Cortes, os cards têm um selo "Novo" no canto. **Clique em "Ver clipe" de um deles → volte → o badge daquele clipe some** (e não volta — é persistido).
- **Tempo relativo**: "há N minutos" no canto do card; passe o mouse para ver a data/hora exata.

## 3. Os 3 cortes para seu ACEITE EDITORIAL (assista, ~2,5 min de vídeo)
Pasta: `C:\CutNicePro\docs\reports\evidence\goal-recuperacao-autoclip-2026-10-23\`
- `g8-corte-1-Melhores-plataformas-para-criar-um-portfolio.mp4` (48 s)
- `g8-corte-2-Quatro-criterios-para-validar-a-eficacia.mp4` (40 s)
- `g8-corte-3-Priorizar-qualidade-em-vez-de-quantidade.mp4` (45 s)

Julgue: título e conteúdo batem? Começo/fim são limpos (agora com bordas em frase completa — o refine novo)? Algo inventado? (Avaliação independente deles: 9,7/10, fidelidade 6/6.)

## 4. Gate D manual (editar + exportar — ~5 min)
1. TXT Aceite Manual → Cortes → **Editar clipe** em um card;
2. Divida no playhead (**"Dividir no playhead"**), remova um trecho (**"Remover trecho do playhead"**), Ctrl+Z se quiser desfazer;
3. **Salvar agora** → saia → reabra o corte — a edição persiste;
4. **Voltar → Baixar** no MESMO card → o MP4 sai com o nome do título e a duração da sua edição.

## 5. Decisões que preciso de você
1. **Aceite editorial** dos 3 MP4s (e da qualidade geral dos cortes com o refine novo);
2. **RAM**: geração pico ~10,2 GB (piso do Gemma 12B no Vulkan). Aceita, ou autoriza o A/B do **reuso do modelo** (a medição mostrou que a recarga por chamada é o gasto real — o reuso economiza 2-3 min sem trocar modelo)?
3. Quer que eu compare o **Qwen 4B** como "modo rápido" no produto, ou mantenho 12B único?
