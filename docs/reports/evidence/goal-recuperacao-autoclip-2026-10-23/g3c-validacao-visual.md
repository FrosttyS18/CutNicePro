# G3C — Interface das ferramentas: validação visual + correções (2026-10-23)

Validação no app real (screenshots `g3c-*.png` + geometria medida via CDP
em `g3c-validacao-visual.json`); aprovação ESTÉTICA segue do mantenedor.

## 1. Checkbox "Gerar automaticamente" — RESOLVIDO
- ANTES: solto entre os botões da barra de ferramentas.
- AGORA: opção contextual **dentro do diálogo "Gerar cortes"** —
  "Gerar automaticamente quando a transcrever terminar" (checkbox
  desmarcado, coordenadas medidas; screenshot `g3c-dialogo-gerar-checkbox.png`).
  Distinção pedida pelo goal: geração por CONTEÚDO (quantidade/duração,
  selects acima) × INICIAR ao terminar a transcrição (este checkbox).
- Opt-in permanece DESLIGADO por padrão; guarda durável por projeto intacta.

## 2. Botões colados no estado vazio — CORRIGIDO (defeito real confirmado)
- ANTES (medido): "Importar vídeo" terminava em x=1880 e "Excluir projeto"
  começava em x=1879 → **sobreposição de 1 px** (colados), exatamente como
  no print do mantenedor.
- CORREÇÃO: `.project-without-media` agora é flex-column com `gap: 16px`
  (regra de gap mínimo 8px respeitada).
- DEPOIS (medido): botões empilhados com **gap vertical de 16 px**.
  Screenshots `g3c-projeto-vazio.png` / `g3c-projeto-vazio-900px.png`
  (largura menor também capturada).

## 3. Alinhamento de "Transcrever novamente" — VERIFICADO (sem defeito de layout)
Geometria medida no estado com transcrição: os controles da coluna direita
("Editar vídeo" → "Transcrever novamente" → "Gerar cortes" → "Cortes (12)")
estão na MESMA coluna (x=2263 para todos) com espaçamentos verticais de
10 px entre vizinhos — dentro da regra de gap mínimo 8 px. "Transcrever
novamente" tem h=48 (2 linhas de texto) e mantém o alinhamento; nenhum
overlap detectado. O print do mantenedor mostrava o estado ANTES do
checkbox ser movido para o diálogo — com a barra agora limpa, o conjunto
fica consistente. Screenshot `g3c-ferramentas-com-transcricao.png`.

## 4. Flag multimodal — CORRIGIDO
`CNP_ENABLE_MULTIMODAL` agora exige o valor `"1"` (`var(...) == Ok("1")`):
presença com 0/vazio NÃO ativa (text_engine.rs).

Validação: tsc OK, TS 227/227, exe reconstruído; VISUAL STATUS deste
conjunto: PENDING HUMAN APPROVAL (screenshots para julgamento do mantenedor).
