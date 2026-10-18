# CutNicePro — UX Foundation (Fase 01)

> Escopo: fundação de experiência baseada no escopo conhecido do produto (`docs/PRODUCT-BRIEF.md`).
> Sem decisões de implementação técnica. Identidade visual definitiva: a definir após avaliação
> das duas propostas de layout (`design/`) pelo mantenedor.

## 1. Princípios de experiência

1. **Ferramenta de criação, não dashboard.** O vídeo é o protagonista; a interface é o
   equipamento ao redor dele — chrome escuro e discreto, moldura para conteúdo.
2. **Fluxo antes de recursos.** As telas seguem o pipeline real: importar → gerar →
   revisar/editar → exportar. Nenhuma funcionalidade importante a mais de 1 clique do fluxo.
3. **Densidade com hierarquia.** Ferramenta profissional: muita informação visível, mas com
   escala tipográfica, peso e cor bem definidos — não é painel administrativo.
4. **Confiança no automático, controle no manual.** A IA propõe (cortes, legendas,
   reenquadramento); o usuário revisa, ajusta e aprova. Estados de progresso sempre visíveis.
5. **Estados completos.** Vazio, importando, analisando, processando, pronto, erro e
   desabilitado existem em cada superfície principal — sem telas "mortas".

## 2. Arquitetura de navegação inicial

Estrutura em dois níveis, sem menus aninhados profundos:

- **Barra superior persistente**: identidade do app, projeto ativo, ações primárias globais
  (Importar, Gerar cortes, Exportar) e área do usuário.
- **Áreas de trabalho (modos)**, alternáveis conforme a etapa do pipeline:
  1. **Biblioteca** — vídeos importados, statuses de análise, início da geração.
  2. **Resultado da geração** — cortes propostos com pontuação, prévia rápida, seleção.
  3. **Editor** — preview central, timeline, inspetor (legendas, reenquadramento, áudio).
  4. **Exportação** — fila, formatos, legendas embutidas, conclusão e organização.
- Painéis laterais mudam de conteúdo conforme a área; navegação por teclado cobre ações
  frequentes (play/pause, marcar in/out, alternar corte).

## 3. Fluxos fundamentais

### 3.1 Importação de vídeos
1. Arrastar e soltar ou selecionar arquivos (longos, curtos ou já editados).
2. Análise técnica por vídeo (duração, resolução, presença de áudio) com progresso visível.
3. Estado "pronto para gerar"; erros de arquivo inválido/sem áudio aparecem na própria linha,
   com causa e ação sugerida.

### 3.2 Geração de cortes
1. Configurar a geração: duração alvo dos cortes, quantidade máxima, idioma das legendas,
   formatos de saída (9:16 / 1:1 / 16:9).
2. Progresso por etapas na própria origem: transcrição → detecção de momentos → montagem
   dos cortes; nada de diálogos bloqueantes.
3. Resultado: lista de cortes com pontuação de potencial, duração e prévia imediata.

### 3.3 Revisão e edição
1. Selecionar um corte na lista → preview imediato com legendas aplicadas.
2. Ajustes no **inspetor**: início/fim (trim), estilo/posição/animação de legendas,
   reenquadramento por formato com foco em rosto, áudio (normalização, ruído).
3. Ajustes na **timeline**: refinamento de trechos, divisão, ordem das faixas (vídeo, áudio,
   legendas). Toda edição é reversível (histórico por corte).
4. O corte editado volta à lista com indicador "ajustado".

### 3.4 Exportação
1. Seleção de cortes (individual ou lote).
2. Configurações por seleção: formato, qualidade, legendas embutidas ou arquivo à parte,
   normalização técnica e limpeza de metadados (sem promessas de "originalidade").
3. Fila com progresso, conclusão e organização de saída (nomeação e pastas por projeto).

## 4. Hierarquia das principais ferramentas

| Nível | Ferramentas | Onde vivem |
|---|---|---|
| N1 — primárias | Importar, Gerar cortes, Exportar | Barra superior / ações de contexto do fluxo |
| N2 — contexto do corte | Prévia, Trim (in/out), Legendas, Reenquadramento/formato | Inspetor + controles do preview |
| N3 — refinamento | Timeline (dividir, ordenar), áudio, ajustes avançados | Timeline + seções recolhíveis do inspetor |
| N4 — admin | Projetos, histórico, configurações do app | Menu de conta / biblioteca |

Regra: ações N1 nunca competem visualmente com N3; cor de destaque é reservada para N1 e
para o estado ativo/selecionado.

## 5. Estados por superfície principal

- **Biblioteca**: vazia (dropzone protagonista) → importando → analisando → pronta → erro
  por item.
- **Resultado da geração**: sem cortes (orientação + atalho para gerar) → gerando (progresso
  por etapa) → pronta (lista ordenável) → falha parcial (itens com erro, resto utilizável).
- **Editor**: sem corte selecionado → corte carregado → editando (dirty) → processando
  ajuste (ex.: re-render de legenda) → salvo.
- **Exportação**: nada selecionado → configurando → na fila → concluída → erro com retry.

## 6. Formatos e preview

- Todo preview indica o formato ativo (9:16 / 1:1 / 16:9) e permite alternar sem sair da
  tela; o reenquadramento inteligente (foco em rosto/participante) é mostrado como sugestão
  aplicável, com overrides manuais.

## 7. Propostas de organização (Fase 01)

Duas alternativas de **experiência e organização** (não apenas de cor), desenhadas no
FigCraft (`design/cutnicepro-fase01-propostas.figcraft`):

- **Proposta A — Creative Studio**: editor-first. Preview central em destaque + timeline
  estruturada + painéis laterais (mídia/cortes à esquerda; inspetor à direita). Para quem
  edita corte a corte com controle fino. Densidade alta, chrome de software profissional.
- **Proposta B — AI Clip Workspace**: resultado-first. Pipeline explícito (stepper), lista
  dos cortes gerados com prévia rápida e ações por item, painel de prévia vertical (9:16)
  do corte selecionado e ações de lote. Para quem revisa muitos cortes rápido e exporta em
  massa. Menor densidade visual nas operações frequentes.

Ambas cobrem o mesmo pipeline; a diferença é onde o usuário passa a maior parte do tempo e
qual superfície recebe prioridade visual.

## 8. Direção de arquitetura de experiência (PROPOSTA — sujeita a aprovação visual)

Decisão de produto registrada em 2026-10-17 (ainda não aprovada como design final):

- **AI Clip Workspace (Proposta B) = experiência principal** de geração e revisão: é a
  porta de entrada do fluxo (importar → gerar → revisar em volume → exportar em lote).
- **Creative Studio (Proposta A) = editor avançado**, acionado ao editar um corte: preview
  central + timeline + inspetor denso para refinamento fino (trim, legendas, reenquadramento,
  áudio).
- As duas interfaces **não são concorrentes** nem descartáveis: compõem um único produto em
  dois níveis de profundidade (revisão rápida → edição dedicada). A navegação entre elas é
  contextual ("Editar" em um corte abre o Creative Studio carregado com aquele corte;
  concluir/fechar retorna ao workspace).

Essa direção orienta a próxima revisão visual e o UI Kit (componentes compartilhados entre
as duas superfícies); nada aqui constitui redesign aprovado — ver
`docs/design/NEXT-REVISION-GUIDELINES.md`.
