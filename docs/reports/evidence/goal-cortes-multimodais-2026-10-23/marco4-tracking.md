# MARCO 4 — Tracking controlado e enquadramento automático (2026-10-23)

## Estudo de referência (revisão fixa)
ByteTrack (FoundationVision/ByteTrack, HEAD d1bf0191adff59bc8fcfeaa0b33d3d1642552a99,
Apache-2.0): `yolox/tracker/byte_tracker.py` lido na íntegra — associação em
DOIS estágios por distância IoU (1: detecções de confiança alta × trilhas
ativas+perdidas com leve fusão de score; 2: trilhas ativas restantes ×
detecções de confiança baixa, resgatando oclusões), predição por Kalman,
buffer de trilhas perdidas e confirmação por hits.
- **ADOTADO**: esquema de associação em dois estágios + buffer de oclusão +
  confirmação mínima, sobre detecções LOCAIS.
- **REJEITADO**: o detector YOLOX e a predição Kalman (dependência de motor/
  pesos adicionais e complexidade desnecessárias ao MVP; atribuição ótima
  para N pequeno por permutação, gulosa acima — simplificação documentada).

## Implementação (`clips/tracking.rs` + `tracking_tests.rs`)
- **Detector de pessoas em movimento**: diferença contra o FUNDO (câmera
  estática — premissa declarada; diferença entre frames só expõe bordas).
  Corte de cena (>45% de mudança) REINICIA trilhas e REBATE o fundo; trilhas
  do plano anterior são ARQUIVADAS (trajetória permanece como evidência,
  sem salto indevido). Score = área normalizada (5% do frame = 1.0).
- **Caso controlado de objeto**: rastreio por COR (alvo = pixel mais
  saturado da região do primeiro frame; centróide por proximidade com raio;
  fora do raio = oclusão projetada). Categoria e seleção registradas.
- **Framing suavizado**: média móvel (5 amostras) do centro, tomada da
  segunda metade, clamp seguro [0.12..0.88]; `None` quando a variância do
  centro < 2% do frame (fantasmas estáticos NUNCA geram framing — provado
  nas demos). Em ambiguidade: sem framing automático = enquadramento
  amplo/seguro.
- **Integração**: `enrich_clip` (M3) agora também rastreia a janela do corte
  a 3 fps (≤256 px) e grava `MultimodalEvidence.framing{cx,cy,source}`;
  `isolatedClipSettings` aplica o framing como `focalPoint` SOMENTE sem
  edição salva — edição manual vence e desativa a automação por corte;
  prévia (focalPoint) e exportação (crop geometry) já consomem o mesmo
  contrato. Associação de FALANTE↔PESSOA: NÃO implementada e NUNCA fingida.

## Demonstrações obrigatórias (FFmpeg REAL, fixtures sintéticas identificadas)
`m4-demos/` (MP4s + trajetórias JSON + cor alvo):
1. **Pessoa em movimento** (corpo+cabeça andando L→R, 6 s): trilha dominante
   28 pontos, variância 0,196, framing (0,64; 0,47); trilha fantasma
   (var 0,013) corretamente SEM framing.
2. **Duas pessoas + troca de plano** (corte duro em 3 s): 8 trilhas; as
   pré-corte ARQUIVADAS com `resetByScene=true` e nenhuma atravessa o corte
   com pontos visíveis (asserção de não-salto); rastreamento presente nos
   dois lados.
3. **Objeto controlado** (bola laranja 18×18, oclusão 2–3 s): categoria
   "bola laranja"; alvo por cor dominante (JSON registrado); oclusão
   marcada e recuperação pós-reaparição; atravessa L→R.
   (Nota honesta: objeto pequeno não dispara o detector de MOVIMENTO —
   o caso controlado usa COR, como previsto no desenho.)

## Testes
Rust 152/152: 3 demos com ffmpeg real (asserções de monotonicidade, corte
sem salto, oclusão/recuperação, framing dentro dos limites) + unidade de
associação ótima com limiar + detector ignora corte de cena/ruído. TS
227/227 (framing no contrato com validação runtime).

## Pendência declarada do marco
A demonstração "um corte COMPLETO com trajetória, prévia e export
equivalentes" fica para o laboratório do aceite (M5/matriz A): a integração
está ligada ponta a ponta no código (enrich → framing → focalPoint →
prévia/export), mas ainda não foi executada num corte REAL gerado pela IA
nesta rodada (orçamento/contexto). Registrado como continuidade, não como
concluído.
