# Modo automático de cortes — critérios e limites (atualização 9)

Estado: implementado e testado em código; aprovação editorial pendente do
mantenedor. Este documento registra o que o modo DECIDE e por quais regras —
nada é escondido do usuário nem fixado a partir de um episódio.

## Contrato

- **Automático (recomendado)**: a UI não envia duração nem quantidade. O app
  resolve LIMITES TÉCNICOS no backend (`types::GenerateOptions::resolve`):
  - duração de um momento: 10–180 s (os mesmos limites absolutos que o
    personalizado aceita; nenhum valor de episódio);
  - sugestões: até 12 (teto técnico/persistência `store::validate`).
  A QUANTIDADE REAL vem do conteúdo: quantos momentos completos existirem.
- **Personalizado**: duração máxima e quantidade continuam nas mãos do
  usuário. A duração MÍNIMA enviada é técnica (10 s) — "até 3 minutos" não
  implica "pelo menos 90 segundos" (associação removida). Quando um momento
  não couber nos limites pedidos, ele não é truncado no meio para preencher
  a quantidade: as alternativas de reparo preservam abertura ou desfecho e a
  seleção final devolve menos cortes quando não há mais momentos válidos.

## Descoberta (automático)

- Prompt próprio (`discover-auto-prompt.txt`): unidades narrativas COMPLETAS
  em toda a extensão fornecida; a duração de cada momento é a que o conteúdo
  pedir, dentro dos limites técnicos; quantidade livre ("de nenhum a limit");
  assuntos distintos; sem força de quantidade.
- Cobertura de todo o vídeo: mesmas janelas do motor em uso (contagem por
  caracteres no padrão; orçamento real de tokens no experimental), com
  sobreposição de fronteira.
- Redundância: DP por não-sobreposição (existente) + instrução de assuntos
  distintos; propostas idênticas entre janelas competem como candidaturas
  próprias e a DP elimina sobreposição.
- Nenhuma redução silenciosa: limites por janela são técnicos e a seleção
  final é matemática (DP). Exclusões do automático são registradas em log:
  `[clips] automático: N abaixo do piso editorial (50) e M de publicidade
  ficaram fora das sugestões`.

## Avaliação conforme a natureza do conteúdo (`evaluate-prompt.txt`)

1. `nature` ANTES do fechamento: relato · humor · explicação · opinião ·
   demonstração. Humor fecha com punchline/reação (não exige resolução); em
   demonstração, apontar onde estão os objetos contados é o desfecho; relato
   e explicação pedem conclusão natural.
2. Contexto × imagem: "depende de contexto anterior" quando o início pressupõe
   o que foi dito antes; "depende da imagem do clipe" quando a fala referencia
   o que aparece na tela do próprio corte. O avaliador só examina a
   transcrição — o prompt VEDA alegar análise visual.
3. `advertising`: leitura de patrocínio/cupom/sorteio/CTA marcada como tal.
4. Nota = julgamento EDITORIAL do intervalo como clipe. Não é validade
   técnica (limites/sobreposição são verificados por código, sempre) nem
   probabilidade de viralização (vedado prometer métricas ou tendências).

### Políticas explícitas do automático

- **Piso editorial 50/100**: candidato cuja própria avaliação fica abaixo
  disso não vira sugestão automática (registrado em log). No personalizado
  não existe piso — o usuário pediu aquela quantidade.
- **Publicidade**: reconhecida pela avaliação e EXCLUÍDA das sugestões
  automáticas (o objetivo do automático são momentos editoriais; política
  registrada, não desaparecimento silencioso). No personalizado ela
  permanece, com o motivo marcado "publicidade" para o usuário decidir.

## Títulos e resumos (`analysis-prompt.txt`)

- Título específico sobre o que acontece (assunto + acontecimento), 8–80
  caracteres, sem tema genérico nem clickbait.
- Resumo natural (2–3 frases, como quem conta a alguém): situação, reação,
  resolução quando houver. PROIBIDO linguagem de relatório ("o falante
  analisa", "o texto descreve", "o trecho mostra"). Sem inventar nomes,
  imagens, números ou consequências ausentes; dependência de contexto ausente
  é dita como tal.
- A justificativa da avaliação (Gancho/Desenvolvimento/Fechamento com
  evidência citada) é SEPARADA do resumo e continua validada contra o texto
  real do intervalo (`analysis.validate`).
- Redação de interface conforme a skill `cutnicepro-ux-writing`.

## O que NÃO mudou

- Motor experimental Gemma e modo padrão intactos (o automático funciona com
  qualquer motor; a escolha continua no diálogo).
- Revisão humana, IDs por intervalo, metadados de motor, mesclagem por
  backend, ordem original dos intervalos (sem montagem fora de ordem),
- Whisper, 9:16, renderização, hooks, configurações globais.
