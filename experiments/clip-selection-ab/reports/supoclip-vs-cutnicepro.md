# SupoClip × CutNicePro — comparação com base em teste real (2026-10-20)

Mesma máquina, mesmo vídeo (cópia byte a byte, sha256 57fbe0fa…, 9:59),
ambos 100% locais. Cortes do CutNicePro = resultados RECENTES já existentes
(atualizações 8 e 9; nenhuma regeração feita para esta comparação).

## Configurações — diferentes por natureza (registrar antes de comparar)

| | CutNicePro (referência) | SupoClip (lab) |
|---|---|---|
| Transcrição | whisper.cpp `base` (CPU, validado no app) | openai-whisper `base` (torch cu128, CUDA RTX 5070) |
| LLM | Gemma-4-12B-IT QAT Q4_0 via llama-completion, thinking OFF, temp 1,0 seed 42 (integração) e Qwen3-4B (automático) | MESMOS pesos (sha 93567e57… idêntico no blob) via Ollama 0.40.6 CUDA, thinking ON (padrão), temp padrão |
| Limites | automático: 10–180 s, piso 50, sem publicidade; personalizado: 10–90 s ×3 | padrões do próprio SupoClip (MAX_CLIPS=10; LLM decidiu 3; duração pelo conteúdo) |
| Tempo total do vídeo | auto 100 s / gemma integrado 690 s / personalizado 33 s | 291 s (transcrição ~92 s; análise+3 renders ~199 s; export do clipe 15,5 s) |

Qualquer diferença de resultado inclui o efeito dessas configurações —
nenhuma comparação abaixo é "prova isolada de algoritmo".

## Casos de avaliação (os dois pedidos)

### 1) História do jogo: crash e perda do save (~48–121 s no vídeo)
- **SupoClip** achou: clipe 00:48–01:44 (56 s, nota 72) "O jogo que faz o
  SSD torar" — criação do personagem → thumbnail ausente → crash → save
  perdido, com abertura antecipada (começa em 48 s, pula a introdução) e
  desfecho na perda do save. Título específico e fiel (o "SSD torando" está
  na fala). Fecho curto: a recapitulação final (~111–121 s) ficou fora.
- **CNP automático** entregou o arco COMPLETO (53,1–232,8 s, 180 s) porém
  colado a outro assunto; **CNP integração Gemma** NÃO achou esse dia
  (escolheu 315/420/488 s); **CNP personalizado 90 s** pega só o começo
  (0–88,7 s, para no crash).
- Leitura honesta: no RECORTE curto e completo, o SupoClip fez a melhor
  versão "pronta para postar" dessa história; o CNP integração falhou em
  achá-la (variância de amostra documentada na atualização 8).

### 2) História da skin antiga da Valve (~405–455 s)
- **CNP automático**: 413,8–455,1 s "Skin bugada e reação do público" ✓.
- **SupoClip**: não selecionou (seus 3 clipes: 276–321 s "Secute", 317–359 s
  pistolas, 48–104 s save). Com só 3 clipes, a skin da Valve ficou de fora.

### Humor / demonstração
- CNP avalia com campo de NATUREZA (relato/humor/explicação/opinião/
  demonstração) desde a atualização 9 — humor fecha em punchline, apontar
  objetos conta como desfecho de demonstração.
- SupoClip não tem campo de natureza, mas o raciocínio do próprio modelo
  distinguiu ("comedic breakdown", "visual comedy potential" no clipe das
  pistolas) e o hook_type classifica o tipo de gancho.
- O clipe das pistolas (contar → apontar onde estão → "que loucura") foi
  bem tratado pelos dois: CNP 315–368 s (em até 3 unidades adjacentes),
  SupoClip 317–359 s em UMA unidade com desfecho.

### Publicidade e posição na lista
- CNP: política EXPLÍCITA — no automático a publicidade fica fora com
  registro em log; no personalizado permanece marcada "publicidade".
  (No episódio: automático já excluiu o comercial da Logitech.)
- SupoClip: nenhuma política de publicidade visível; neste vídeo nenhum
  comercial foi proposto (região 8:13+ intocada), então o caso não foi
  exercido — fica como diferença de POLÍTICA, não de resultado.

### Abertura antecipada e montagem interna
- Abertura antecipada: CNP tem alternativas de reparo ("início avançado"
  preserva o desfecho — foi assim que o arco completo surgiu na atualização
  7); SupoClip também abriu cedo (48 s). Empate técnico.
- Montagem: **SupoClip tem editor de montagem** (cortar/dividir em
  playhead, juntar dois clipes num rascunvo, mover/duplicar segmentos,
  trim por palavra no tempo); o CNP NÃO tem (por decisão de escopo —
  montagem fora de ordem não implementada). Vantagem clara do SupoClip.

### Título, resumo e texto sobreposto
- CNP: título do acontecimento + resumo natural em 2–3 frases + justificativa
  com citação do trecho (validação por evidência no código).
- SupoClip: hook_title curto e específico ("O jogo que faz o SSD torar",
  "O cara mais preparado para a guerra") + raciocínio (em inglês) + notas
  por dimensão (hook/engagement/value/shareability). Legendas queimadas
  palavra a palavra (libass) com estilo configurável no editor.
- Texto sobreposto: só o SupoClip entrega hoje (legendas animadas no
  render); CNP exporta com legendas próprias, mas o acerto visual 9:16 e
  estilos avançados seguem pendentes.

### Enquadramento, legendas e exportação
- SupoClip: 9:16 com crop automático (face-aware), presets, export
  validado 1080×1080 H.264+AAC em 15,5 s, download direto, exportação em
  segundo plano que continua se a página fechar.
- CNP: exportação FFmpeg funciona, mas "Ajustar/Preencher 9:16" está fora
  do escopo atual (declarado). Vantagem do SupoClip no fluxo vertical.

### Esforço para corrigir um clipe
- SupoClip: editor completo — trim, dividir, juntar, mover enquadramento
  arrastando, trocar proporção (9:16/1:1/original), editar qualquer palavra
  da legenda, desfazer/refazer, autosave ("All changes saved"), rascunho
  separado da geração original ("Restore original"), exportar de novo.
  Tudo verificado nesta sessão.
- CNP: hoje corrige-se regenerando com outros limites; revisão humana
  (aprovar/rejeitar) existe, edição fina de clipe ainda não.

## Automático × manual (distinção)
- SupoClip — automático: achar momentos, notas, títulos, crop 9:16,
  legendas sincronizadas. Manual (no editor): trim/reframe/legenda/estilo.
- CNP — automático: descoberta por unidades narrativas, avaliação por
  natureza, DP sem sobreposição, título/resumo/análise com evidência.
  Manual: revisão (aprovar/rejeitar/exportar).

## Medidas (não são só notas nem contagens)
- Completude narrativa: save — SupoClip 56 s completos × CNP-auto 180 s
  completos × CNP-integração não achou. Skin Valve — CNP achou, SupoClip
  não (3 clipes).
- Fidelidade do texto: ambos fiéis; SupoClip herda erros do whisper base
  ("tambinei o missing", "crachou") e EXPÕE a edição por palavra para
  corrigir em segundos — o CNP hoje exigiria retranscrição.
- Tempo até um clipe postável: SupoClip 291 s vídeo→3 clipes 9:16
  legendados prontos; CNP ~100–690 s conforme modo + exportação.

## Vale adotar / adaptar / portar / descartar (baseado no teste)

- **ADOTAR (conceito)**: editor de rascunho separado da geração original +
  "Restaurar original"; autosave contínuo com status visível; desfazer/
  refazer no editor; exportação em segundo plano que sobrevive ao fechamento.
- **ADAPTAR**: edição de legenda por palavra com carimbo de tempo (no CNP a
  transcrição já tem palavras — base técnica existente); presets de
  proporção no momento da geração; razões/justificativa por dimensão
  (hook/engagement/value/shareability) como camada descritiva além da nota
  única — desde que separada de validade técnica e sem promessa de
  viralização (a política do CNP veda tratar nota como probabilidade).
- **PORTAR (futuro, exige decisão do mantenedor)**: montagem interna
  (dividir/juntar segmentos) — hoje fora do escopo declarado do CNP; crop
  9:16 com detecção de rosto (mediapipe/opencv) para o item pendente
  "Ajustar/Preencher 9:16".
- **DESCARTAR**: dependência de Docker/elevação para uso local (o caminho
  nativo do próprio repo funciona); integrações sociais/B-roll como
  requisito (não exercidas e desnecessárias para o fluxo local); reasoning
  em inglês para usuário final (no CNP os textos publicados são pt-BR por
  política).

## Limitações desta comparação
- Uma amostra por lado (política da tarefa: sem votação de amostras); com
  temp alta os conjuntos variam entre execuções.
- Transcritores e runtime de LLM diferentes (tabela acima) — os efeitos
  não são separáveis sem experimento controlado, que esta tarefa veda.
- SupoClip com 3 clipes × CNP com 12 (automático): cobertura total do vídeo
  favorece listas maiores; a leitura por HISTÓRIA acima controla isso.
