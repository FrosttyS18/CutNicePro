# GUIA DO MANTENEDOR — goal-refino-editorial-fluxo-local (2026-10-24, atualizado após F2c)

Este guia cobre SÓ o que este goal entregou. A tabela completa dos vídeos
está em `f4-tabela-de-videos.md` (nesta mesma pasta).

## IMPORTANTE — o app aberto na sua tela está em build ANTIGA

O app aberto (desde a manhã) tem a correção do "Editar clipe", mas **NÃO** a
correção do **Baixar** que eu achei depois: um bug real fazia TODO "Baixar"
com legendas falhar com "Não foi possível processar o vídeo" ANTES de abrir
a janela de salvar (erro de contrato entre interface e motor). Já corrigido
e comprovado em laboratório (MP4 publicado pela rota real do botão +
diálogo nativo, 17,1 s).

**Para testar o Baixar você precisa do app reaberto com a build corrigida:
me avise (ou feche o app) que eu abro em segundos.** A mesma correção vale
para o seu teste manual do gate D.

## Teste 1 — "Editar clipe" entra no modo corte (~1 min; funciona na build atual)

1. Abra um projeto → **Cortes** → em um card clique **Editar clipe**;
2. Resultado esperado: editor abre em MODO CORTE, com "Dividir no playhead"
   e "Remover trecho do playhead" visíveis.

## Teste 2 — (após reabrir com a build corrigida) Baixar pelo botão (~1 min)

1. Projeto → Cortes → card → **Baixar**;
2. Resultado esperado: janela nativa "Exportar vídeo" abre com o nome
   "{projeto}-{título do corte}.mp4" → escolha a pasta → **Salvar** →
   progresso "Exportando…" → "Vídeo exportado." e o MP4 na pasta escolhida.

## Teste 3 — os vídeos deste goal (assista, ~30 s no total)

- `f2c-corte-BOTAO-dialogo-nativo.mp4` (17 s) — exportado PELO BOTÃO real +
  diálogo nativo (o critério que faltava). Julgue início/fim/legendas.
- `f2-corte-EDITADO-pipeline.mp4` (9 s) — corte real com o meio removido
  pela UI. Julgue se a junção ficou limpa.

## Decisões que dependem de você

1. **Aceite editorial** dos vídeos do Teste 3 (e qualidade geral dos cortes);
2. **Calibração editorial**: a causa dos 3 cortes que você reprovou é o
   PROMPT de seleção/título (janela termina antes da conclusão ou começa
   depois da apresentação — não é o ajuste fino de fronteiras). Autoriza UMA
   rodada de calibração de prompt + re-geração SOMENTE da amostra reprovada
   (3 reprovados + 2 abaixo da nota-alvo)?
3. **Reuso do modelo (server)**: medido — 7× MAIS LENTO (14 min vs 2 min) e
   MAIS RAM (17,9 vs 10,2 GB). Rejeitado como padrão; fica experimental
   (`CNP_TEXT_SERVER=1`). Confirma? Piso de RAM do caminho padrão: ~10,2 GB.
4. (Herdada) quer o **Qwen 4B** como "modo rápido" no produto, ou 12B único?
