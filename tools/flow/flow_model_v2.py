#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CutNicePro — Fase 02A.2 — Modelo lógico + planejador geométrico dos fluxos V2.
(Fase 02A.4: procedimento de Z-ORDER adicionado — ver PROCEDIMENTO DE CONSTRUÇÃO)

Método (resposta à auditoria que REPROVOU o Master User Flow V1):
  1. Modelo ANTES do desenho: nós com IDs estáveis, tipos, referências
     (JRN/BR/DEC) e arestas com origem/destino/waypoints/rótulo/tipo de relação.
  2. Geometria CALCULADA: grid com paddings e espaçamentos definidos
     (padding nó h>=20 v>=14; espaçamento v 72-100; texto principal 16px;
     rótulos >=14px). O container adapta-se ao texto (texto NUNCA é reduzido).
  3. Conectores: rotas ortogonais com waypoints explícitos, ponta de seta no
     destino (endCap triangleArrow) e linguagem de linha.

PROCEDIMENTO DE CONSTRUÇÃO (Z-ORDER) — OBRIGATÓRIO (Fase 02A.4):
  O FigCraft 0.6.0 empilha por ORDEM DE INSERÇÃO (children = bottom-first,
  provado empiricamente: node.create entra NO TOPO; node.reorder{id,index}
  move; 0 = fundo). A regressão da 02A.3 ocorreu por recriar losangos via
  create_node DEPOIS dos textos existentes, cobrindo-os.
  Regras para qualquer construção/reconstrução destes fluxos:
    a) Criar na ORDEM: (1) formas/superfícies dos nós → (2) conectores →
       (3) textos/rótulos/anotações. Assim o empilhamento correto nasce da
       própria sequência (contrato: formas < conectores < textos).
    b) Ao RECRIAR uma forma quando textos já existem: criar e imediatamente
       `node.reorder {id, index: <índice das formas>}` (fundo), NUNCA deixar
       no topo por padrão.
    c) Após cada lote de criação: inspecionar (get_node) a ordem real das
       children e rodar o gate (check_zorder) ANTES de exportar/declarar PASS.
    d) O gate tools/flow/flow_gate_v2.py valida a ordem EFETIVA no documento
       (Z1 texto sob forma opaca; Z2 traço atravessando rótulo) — PASS de
       geometria sem PASS de z-order não é PASS visual.

Uso:
  python tools/flow/flow_model_v2.py            # valida e grava o manifest
  python tools/flow/flow_model_v2.py --report   # idem + relatório completo

Saída: design/flow-v2/manifest-v2.json (fonte única da construção).
O gate (flow_gate_v2.py) valida este manifest e o cruza com o dump real
do documento FigCraft.
"""
import json
import os
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(ROOT, "design", "flow-v2")
MANIFEST = os.path.join(OUT_DIR, "manifest-v2.json")

# ---------------------------------------------------------------- constantes
AQUA = "#02C2BE"      # Deep Aqua — trajetória principal
INK = "#231F20"       # Attractive Black — fundo dos frames
SURFACE = "#2B2728"   # superfície elevada (cards)
BORDER = "#3A3A3C"    # borda neutra
MARBLE = "#E6E7E8"    # White Marble — texto principal
MARBLE70 = "#B9BBBD"  # texto de apoio / conectores de retorno
RED = "#E5484D"       # erro (semântica provisória)
AMBER = "#F5A524"     # decisão/política PENDENTE (semântica provisória)
BLACK = "#000000"

FONT = "Poppins"
W_REG, W_BOLD = 0.62, 0.68  # largura média estimada por caractere (px)
LINE_H = 1.35

# Grid mínimo exigido pela especificação da tarefa (gate confere):
MIN_PAD_H, MIN_PAD_V = 20, 14      # padding interno dos nós
MIN_FONT = 14                       # qualquer texto >= 14px
TITLE_FONT = 16                     # texto principal dos nós
MIN_GAP_V = 72                      # espaçamento vertical entre linhas do grid

LINE_STYLES = {  # linguagem de linha (conectores)
    "main":       dict(color=AQUA,     weight=2.0, dashes=None),
    "return":     dict(color=MARBLE70, weight=1.5, dashes=[8, 6]),
    "reference":  dict(color=MARBLE,   weight=2.0, dashes=[2, 5]),
    "error":      dict(color=RED,      weight=1.5, dashes=None),
    "pending":    dict(color=AMBER,    weight=1.5, dashes=[8, 6]),
    "pending_go": dict(color=AMBER,    weight=1.5, dashes=None),
}

# ---------------------------------------------------------------- frames V2
FRAMES = {
    "00": dict(
        name="00 — PRODUCT FLOW OVERVIEW V2",
        x=2460, y=-123, w=2330, h=1360,
        title="00 — PRODUCT FLOW OVERVIEW — V2",
        subtitle=("Fluxo macro do produto · 8 etapas · exceções detalhadas nos fluxos "
                  "dedicados · reconstrução auditada (02A.2)"),
    ),
    "01": dict(
        name="01 — FIRST RUN & ACCESS USER FLOW V2",
        x=2460, y=1337, w=3656, h=1160,
        title="01 — FIRST RUN & ACCESS — V2",
        subtitle=("Piloto de reconstrução · fluxo principal unidirecional → · exceções abaixo · "
                  "políticas pendentes em ÂMBAR (◇) · JRN-001 · JRN-002 · JRN-014 · "
                  "BR-037 · BR-049 · DEC-011 · DEC-012"),
    ),
}

# ---------------------------------------------------------------- nós
# type: terminal_start | terminal_end | terminal_exit | process | decision |
#       state | pending | note_ref
# texts: [(string, size, weight)]  — weight: "Regular" | "Bold" | "Italic"
NODES = [
    # ---------- FRAME 00 — OVERVIEW (espinha horizontal, 8 etapas macro) ----
    dict(id="OV-T0", frame="00", type="terminal_start",
         x=48, y=676, w=150, h=60,
         texts=[("INÍCIO", 14, "Bold")], ref="JRN-001"),
    dict(id="OV-P1", frame="00", type="process",
         x=236, y=640, w=196, h=132,
         texts=[("Primeira execução", TITLE_FONT, "Bold"),
                ("ambiente & acesso · JRN-001", MIN_FONT, "Regular")], ref="JRN-001"),
    dict(id="OV-P2", frame="00", type="process", accent="pending",
         x=470, y=640, w=196, h=132,
         texts=[("Onboarding & IA", TITLE_FONT, "Bold"),
                ("config de IA · JRN-013 · D1 ◇", MIN_FONT, "Regular")], ref="JRN-013"),
    dict(id="OV-P3", frame="00", type="process",
         x=704, y=640, w=196, h=132,
         texts=[("Home — Projetos", TITLE_FONT, "Bold"),
                ("biblioteca · JRN-002", MIN_FONT, "Regular")], ref="JRN-002"),
    dict(id="OV-P4", frame="00", type="process",
         x=938, y=640, w=196, h=132,
         texts=[("Importar mídia", TITLE_FONT, "Bold"),
                ("vídeo longo · JRN-004", MIN_FONT, "Regular")], ref="JRN-004"),
    dict(id="OV-P5", frame="00", type="process",
         x=1172, y=640, w=196, h=132,
         texts=[("Processamento IA", TITLE_FONT, "Bold"),
                ("cortes + scores · JRN-007", MIN_FONT, "Regular")], ref="JRN-007"),
    dict(id="OV-P6", frame="00", type="process",
         x=1406, y=640, w=196, h=132,
         texts=[("Revisar resultados", TITLE_FONT, "Bold"),
                ("seleção & validação · JRN-008", MIN_FONT, "Regular")], ref="JRN-008"),
    dict(id="OV-P7", frame="00", type="process",
         x=1640, y=640, w=196, h=132,
         texts=[("Refinar no editor", TITLE_FONT, "Bold"),
                ("ajustes finos · JRN-009", MIN_FONT, "Regular")], ref="JRN-009"),
    dict(id="OV-P8", frame="00", type="process",
         x=1874, y=640, w=196, h=132,
         texts=[("Exportar para publicação", TITLE_FONT, "Bold"),
                ("saída final · JRN-010", MIN_FONT, "Regular")], ref="JRN-010"),
    dict(id="OV-T1", frame="00", type="terminal_end",
         x=2108, y=670, w=170, h=72,
         texts=[("CICLO CONCLUÍDO", 14, "Bold")], ref=None),
    dict(id="OV-NOTE1", frame="00", type="note_ref",
         x=420, y=200, w=480, h=64,
         texts=[("DETALHE → Fluxo 01 — First Run & Access (V2)", MIN_FONT, "Italic")],
         ref="BR-002"),

    # ---------- FRAME 01 — PILOTO FIRST RUN & ACCESS (paisagem) --------------
    # Espinha principal horizontal (esquerda → direita, y≈480); exceções abaixo.
    dict(id="N01", frame="01", type="terminal_start",
         x=48, y=444, w=280, h=72,
         texts=[("INÍCIO — PRIMEIRA ABERTURA", 14, "Bold")], ref="JRN-001"),
    dict(id="N02", frame="01", type="process",
         x=388, y=430, w=320, h=100,
         texts=[("Verificação de ambiente", TITLE_FONT, "Bold"),
                ("SO · GPU · disco · permissões", MIN_FONT, "Regular")], ref="JRN-001"),
    dict(id="N03", frame="01", type="decision",
         x=818, y=360, w=240, h=240,
         texts=[("Ambiente compatível?", TITLE_FONT, "Bold")], ref="JRN-014"),
    dict(id="N04", frame="01", type="process", accent="pending",
         x=1188, y=420, w=340, h=120,
         texts=[("Verificação de acesso", TITLE_FONT, "Bold"),
                ("assinatura · BR-037 · DEC-011 ◇", MIN_FONT, "Regular")], ref="BR-037"),
    dict(id="NL", frame="01", type="decision",
         x=1648, y=360, w=240, h=240,
         texts=[("App online?", TITLE_FONT, "Bold")], ref="BR-049"),
    dict(id="N08", frame="01", type="decision", accent="pending",
         x=2038, y=360, w=240, h=240,
         texts=[("Acesso ativo?", TITLE_FONT, "Bold"),
                ("mecanismo DEC-011 ◇", MIN_FONT, "Regular")], ref="DEC-011"),
    dict(id="N09", frame="01", type="decision",
         x=2448, y=360, w=240, h=240,
         texts=[("Primeira execução?", TITLE_FONT, "Bold")], ref="JRN-001"),
    dict(id="N11", frame="01", type="process",
         x=2828, y=420, w=340, h=120,
         texts=[("First-run: tour + IA", TITLE_FONT, "Bold"),
                ("config de IA · JRN-013 (DEC-012)", MIN_FONT, "Regular")], ref="JRN-013"),
    dict(id="N12", frame="01", type="terminal_end",
         x=3268, y=444, w=340, h=72,
         texts=[("HOME · BIBLIOTECA", 14, "Bold")], ref="JRN-002"),
    # exceções (abaixo da espinha)
    dict(id="N05", frame="01", type="process",
         x=788, y=700, w=320, h=96,
         texts=[("Diagnóstico exibido", TITLE_FONT, "Bold"),
                ("causa + correção sugerida", MIN_FONT, "Regular")], ref="JRN-014"),
    dict(id="N06", frame="01", type="decision",
         x=863, y=831, w=150, h=150,
         texts=[("Repetir?", 15, "Bold")], ref="JRN-014"),
    dict(id="N07", frame="01", type="terminal_exit",
         x=788, y=1016, w=320, h=56,
         texts=[("SAÍDA — CORRIGIR FORA DO APP", 14, "Bold")], ref=None),
    dict(id="N10", frame="01", type="state",
         x=1988, y=700, w=340, h=110,
         texts=[("Ação requerendo acesso", TITLE_FONT, "Bold"),
                ("ativar assinatura · BR-037", MIN_FONT, "Regular")], ref="BR-037"),
    dict(id="N13", frame="01", type="note_ref",
         x=2480, y=960, w=340, h=76,
         texts=[("JRN-012 · compra fora do app (DEC-010)", MIN_FONT, "Italic")], ref="JRN-012"),
    dict(id="N14", frame="01", type="pending",
         x=1598, y=850, w=340, h=110,
         texts=[("Política offline PENDENTE", TITLE_FONT, "Bold"),
                ("cortesia proposta · BR-049 ◇", MIN_FONT, "Regular")], ref="BR-049"),
    # conectores off-page (retorno longo N10→N04, notação ISO 5807)
    dict(id="N15", frame="01", type="offpage_out",
         x=2380, y=735, w=44, h=44,
         texts=[("A", 14, "Bold")], ref="BR-037"),
    dict(id="N16", frame="01", type="offpage_in",
         x=1358, y=350, w=44, h=44,
         texts=[("A", 14, "Bold")], ref="BR-037"),
]

# ---------------------------------------------------------------- arestas
# kind: main | return | reference | error | pending | pending_go
# path: waypoints absolutos RELATIVOS AO FRAME (seta no ÚLTIMO ponto).
EDGES = [
    # ---------- FRAME 00 -----------------------------------------------------
    dict(id="E-OV-00", frame="00", kind="main",     **{"from": "OV-T0", "to": "OV-P1"},
         path=[[198, 706], [236, 706]], label=None),
    dict(id="E-OV-01", frame="00", kind="main",     **{"from": "OV-P1", "to": "OV-P2"},
         path=[[432, 706], [470, 706]], label=None),
    dict(id="E-OV-02", frame="00", kind="main",     **{"from": "OV-P2", "to": "OV-P3"},
         path=[[666, 706], [704, 706]], label=None),
    dict(id="E-OV-03", frame="00", kind="main",     **{"from": "OV-P3", "to": "OV-P4"},
         path=[[900, 706], [938, 706]], label=None),
    dict(id="E-OV-04", frame="00", kind="main",     **{"from": "OV-P4", "to": "OV-P5"},
         path=[[1134, 706], [1172, 706]], label=None),
    dict(id="E-OV-05", frame="00", kind="main",     **{"from": "OV-P5", "to": "OV-P6"},
         path=[[1368, 706], [1406, 706]], label=None),
    dict(id="E-OV-06", frame="00", kind="main",     **{"from": "OV-P6", "to": "OV-P7"},
         path=[[1602, 706], [1640, 706]], label=None),
    dict(id="E-OV-07", frame="00", kind="main",     **{"from": "OV-P7", "to": "OV-P8"},
         path=[[1836, 706], [1874, 706]], label=None),
    dict(id="E-OV-08", frame="00", kind="main",     **{"from": "OV-P8", "to": "OV-T1"},
         path=[[2070, 706], [2108, 706]], label=None),
    dict(id="E-OV-RET", frame="00", kind="return",
         **{"from": "OV-P8", "to": "OV-P3"},
         path=[[1972, 772], [1972, 920], [802, 920], [802, 772]],
         label=dict(text="novo projeto / retorno à Home", x=1337, y=894)),
    dict(id="E-OV-IT", frame="00", kind="return",
         **{"from": "OV-P7", "to": "OV-P6"},
         path=[[1738, 640], [1738, 530], [1504, 530], [1504, 640]],
         label=dict(text="iterar até satisfatório", x=1621, y=506)),
    dict(id="E-OV-REF", frame="00", kind="reference",
         **{"from": "OV-P1", "to": "OV-NOTE1"},
         path=[[334, 640], [334, 232], [420, 232]], label=None),

    # ---------- FRAME 01 (paisagem, losangos 1:1) -----------------------------
    dict(id="E01", frame="01", kind="main", **{"from": "N01", "to": "N02"},
         path=[[328, 480], [388, 480]], label=None),
    dict(id="E02", frame="01", kind="main", **{"from": "N02", "to": "N03"},
         path=[[708, 480], [818, 480]], label=None),
    dict(id="E03", frame="01", kind="main", **{"from": "N03", "to": "N04"},
         path=[[1058, 480], [1188, 480]], label=dict(text="SIM", x=1100, y=454)),
    dict(id="E04", frame="01", kind="error", **{"from": "N03", "to": "N05"},
         path=[[938, 600], [938, 700]], label=dict(text="NÃO", x=950, y=650)),
    dict(id="E05", frame="01", kind="return", **{"from": "N05", "to": "N06"},
         path=[[938, 796], [938, 831]], label=None),
    dict(id="E06", frame="01", kind="return", **{"from": "N06", "to": "N02"},
         path=[[863, 906], [548, 906], [548, 530]],
         label=dict(text="SIM · repetir verificação", x=560, y=880)),
    dict(id="E07", frame="01", kind="main", **{"from": "N06", "to": "N07"},
         path=[[938, 981], [938, 1016]], label=dict(text="NÃO", x=950, y=984)),
    dict(id="E08", frame="01", kind="main", **{"from": "N04", "to": "NL"},
         path=[[1528, 480], [1648, 480]], label=None),
    dict(id="E09", frame="01", kind="main", **{"from": "NL", "to": "N08"},
         path=[[1888, 480], [2038, 480]], label=dict(text="SIM", x=1920, y=454)),
    dict(id="E10", frame="01", kind="pending", **{"from": "NL", "to": "N14"},
         path=[[1768, 600], [1768, 850]], label=dict(text="NÃO · offline", x=1780, y=650)),
    dict(id="E11", frame="01", kind="pending", **{"from": "N14", "to": "N12"},
         path=[[1650, 960], [1650, 1100], [3338, 1100], [3338, 516]],
         label=dict(text="PROPOSTA · modo cortesia (BR-049 ◇)", x=2340, y=1076)),
    dict(id="E12", frame="01", kind="main", **{"from": "N08", "to": "N09"},
         path=[[2278, 480], [2448, 480]], label=dict(text="SIM", x=2320, y=454)),
    dict(id="E13", frame="01", kind="pending_go", **{"from": "N08", "to": "N10"},
         path=[[2158, 600], [2158, 700]], label=dict(text="NÃO", x=2170, y=650)),
    dict(id="E14", frame="01", kind="reference", **{"from": "N10", "to": "N13"},
         path=[[2250, 810], [2250, 936], [2650, 936], [2650, 960]],
         label=dict(text="ver fluxo de compra", x=2280, y=908)),
    # retorno longo N10→N04 via conector off-page "A" (ISO 5807):
    #   E15a: N10 → conector de saída A · E15b: conector de entrada A → N04
    dict(id="E15a", frame="01", kind="return", **{"from": "N10", "to": "N15"},
         path=[[2328, 757], [2380, 757]],
         label=dict(text="após ativar → A", x=2335, y=790)),
    dict(id="E15b", frame="01", kind="return", **{"from": "N16", "to": "N04"},
         path=[[1380, 394], [1380, 420]],
         label=dict(text="A · reverificar acesso", x=1415, y=368)),
    dict(id="E16", frame="01", kind="main", **{"from": "N09", "to": "N11"},
         path=[[2688, 480], [2828, 480]], label=dict(text="SIM", x=2734, y=454)),
    dict(id="E17", frame="01", kind="main", **{"from": "N09", "to": "N12"},
         path=[[2568, 360], [3438, 360], [3438, 444]],
         label=dict(text="NÃO · recorrente", x=2900, y=334)),
    dict(id="E18", frame="01", kind="main", **{"from": "N11", "to": "N12"},
         path=[[3168, 480], [3268, 480]], label=None),
]

# ---------------------------------------------------------------- estilos de nó
NODE_STYLES = {
    "terminal_start": dict(fill=AQUA, stroke=AQUA, stroke_w=0, r="h/2",
                           text_color=BLACK),
    "terminal_end":   dict(fill=INK, stroke=AQUA, stroke_w=1.5, r="h/2",
                           text_color=AQUA),
    "terminal_exit":  dict(fill=INK, stroke=RED, stroke_w=1.5, r="h/2",
                           text_color=RED),
    "process":        dict(fill=SURFACE, stroke=BORDER, stroke_w=1, r=8,
                           text_color=MARBLE),
    "process#pending": dict(fill=SURFACE, stroke=AMBER, stroke_w=1.5, r=8,
                            text_color=MARBLE),
    "decision":       dict(fill=INK, stroke=AQUA, stroke_w=1.5, r=0,
                           text_color=MARBLE),
    "decision#pending": dict(fill=INK, stroke=AMBER, stroke_w=1.5, r=0,
                             text_color=MARBLE),
    "state":          dict(fill=SURFACE, stroke=BORDER, stroke_w=1, r=8,
                           text_color=MARBLE),
    "pending":        dict(fill=SURFACE, stroke=AMBER, stroke_w=1.5, r=8,
                           text_color=MARBLE),
    "note_ref":       dict(fill=None, stroke=MARBLE70, stroke_w=1, r=6,
                           text_color=MARBLE70, stroke_dashes=[4, 3]),
    "offpage_out":    dict(fill=INK, stroke=MARBLE70, stroke_w=1.5, r="h/2",
                           text_color=MARBLE70),
    "offpage_in":     dict(fill=INK, stroke=AQUA, stroke_w=1.5, r="h/2",
                           text_color=AQUA),
}


def node_style(n):
    key = n["type"] + ("#pending" if n.get("accent") == "pending" else "")
    return NODE_STYLES[key]


# ---------------------------------------------------------------- planejador
def text_metrics(s, size, weight):
    w = W_BOLD if weight == "Bold" else W_REG
    return size * w * len(s), size * LINE_H


def wrap(s, size, weight, max_w):
    """Quebra em palavras respeitando max_w; retorna lista de linhas."""
    lines, cur = [], ""
    for word in s.split():
        cand = word if not cur else cur + " " + word
        if text_metrics(cand, size, weight)[0] <= max_w or not cur:
            cur = cand
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def plan_node(n):
    """Valida que os textos cabem no nó com o padding mínimo do grid."""
    errors = []
    if n["type"].startswith("offpage"):
        # círculo: texto centrado, cabe se couber no quadrilátero inscrito
        inner_w, inner_h = n["w"] * 0.64, n["h"] * 0.64
        for (s, size, weight) in n["texts"]:
            lw, lh = text_metrics(s, size, weight)
            if lw > inner_w or lh > inner_h:
                errors.append(f"{n['id']}: texto {lw:.0f}x{lh:.0f} não cabe no círculo")
        return [], errors
    if n["type"] == "decision":
        # Fase 02A.3: losango 1:1 (±2%) e texto dentro da ÁREA REAL INSCRITA
        # (bounding box retangular NÃO é área segura de losango).
        ratio = n["w"] / n["h"]
        if abs(ratio - 1.0) > 0.02:
            errors.append(f"{n['id']}: losango {n['w']}x{n['h']} proporção "
                          f"{ratio:.3f} fora de 1:1 ±2%")
        hw, hh = n["w"] / 2, n["h"] / 2
        total_h = 0.0
        max_lw = 0.0
        wrapped = []
        for (s, size, weight) in n["texts"]:
            if size < MIN_FONT:
                errors.append(f"{n['id']}: fonte {size}px < mínimo {MIN_FONT}px")
            lines = wrap(s, size, weight, n["w"] * 0.72)
            wrapped.append((lines, size, weight))
            total_h += len(lines) * size * LINE_H
            for ln in lines:
                max_lw = max(max_lw, text_metrics(ln, size, weight)[0])
        tw, th = max_lw / 2, total_h / 2
        if tw / hw + th / hh > 0.95:
            errors.append(
                f"{n['id']}: texto {max_lw:.0f}x{total_h:.0f} fora da área real do "
                f"losango (tw/hw+th/hh={tw / hw + th / hh:.2f} > 0,95)")
        return wrapped, errors
    inner_w = n["w"] - 2 * MIN_PAD_H
    total_h = 0.0
    wrapped = []
    for (s, size, weight) in n["texts"]:
        if size < MIN_FONT:
            errors.append(f"{n['id']}: fonte {size}px < mínimo {MIN_FONT}px")
        lines = wrap(s, size, weight, inner_w)
        lw, _ = text_metrics(" ".join(lines), size, weight)
        if lw > inner_w + 0.01 and len(lines) == 1:
            errors.append(f"{n['id']}: linha não cabe ({lw:.0f}px > {inner_w:.0f}px)")
        wrapped.append((lines, size, weight))
        total_h += len(lines) * size * LINE_H
    if total_h > n["h"] - 2 * MIN_PAD_V + 0.01:
        errors.append(
            f"{n['id']}: bloco de texto {total_h:.0f}px não cabe em "
            f"{n['h'] - 2 * MIN_PAD_V:.0f}px úteis (texto nunca é reduzido)")
    return wrapped, errors


def rects(nodes):
    return {n["id"]: (n["x"], n["y"], n["x"] + n["w"], n["y"] + n["h"])
            for n in nodes}


def point_in_node(px, py, n, r):
    """Colisão pontual com a FORMA real do nó (losango p/ decisão)."""
    if n["type"] == "decision":
        cx, cy = (r[0] + r[2]) / 2, (r[1] + r[3]) / 2
        hw, hh = (r[2] - r[0]) / 2, (r[3] - r[1]) / 2
        return abs(px - cx) / hw + abs(py - cy) / hh < 1.0
    return r[0] < px < r[2] and r[1] < py < r[3]


def box_hits_node(x0, y0, x1, y1, n, r, samples=24):
    """Colisão de um box (ou segmento amostrado) com a forma do nó."""
    for s in range(samples + 1):
        t = s / samples
        px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        if point_in_node(px, py, n, r):
            return True
    return False


def rect_edges(r):
    return [(r[0], r[1], r[2], r[1]), (r[0], r[3], r[2], r[3]),
            (r[0], r[1], r[0], r[3]), (r[2], r[1], r[2], r[3])]


def check_geometry(nodes, edges):
    errors = []
    by_id = {n["id"]: n for n in nodes}

    for frame in sorted({n["frame"] for n in nodes}):
        fnodes = [n for n in nodes if n["frame"] == frame]
        fedges = [e for e in edges if e["frame"] == frame]
        R = rects(fnodes)

        # G-NODE: sobreposição entre nós (amostra as 4 arestas × forma real)
        for i in range(len(fnodes)):
            for j in range(i + 1, len(fnodes)):
                a, b = fnodes[i], fnodes[j]
                ra, rb = R[a["id"]], R[b["id"]]
                hit = any(box_hits_node(ax0, ay0, ax1, ay1, b, rb)
                          for (ax0, ay0, ax1, ay1) in rect_edges(ra)) or \
                      any(box_hits_node(bx0, by0, bx1, by1, a, ra)
                          for (bx0, by0, bx1, by1) in rect_edges(rb))
                if hit:
                    errors.append(f"sobreposição de nós: {a['id']} × {b['id']}")

        # G-EDGE: contato dos extremos com as bordas dos nós
        # (arestas com nó inexistente são reportadas pela validação lógica)
        for e in fedges:
            if e["from"] not in R or e["to"] not in R:
                continue
            (x0, y0), (x1, y1) = e["path"][0], e["path"][-1]
            rs, rt = R[e["from"]], R[e["to"]]
            on_s = (any(abs(x0 - v) < 1.5 for v in (rs[0], rs[2]))
                    and rs[1] - 1.5 <= y0 <= rs[3] + 1.5) or \
                   (any(abs(y0 - v) < 1.5 for v in (rs[1], rs[3]))
                    and rs[0] - 1.5 <= x0 <= rs[2] + 1.5)
            on_t = (any(abs(x1 - v) < 1.5 for v in (rt[0], rt[2]))
                    and rt[1] - 1.5 <= y1 <= rt[3] + 1.5) or \
                   (any(abs(y1 - v) < 1.5 for v in (rt[1], rt[3]))
                    and rt[0] - 1.5 <= x1 <= rt[2] + 1.5)
            if not on_s:
                errors.append(f"{e['id']}: origem ({x0},{y0}) não toca a borda de {e['from']}")
            if not on_t:
                errors.append(f"{e['id']}: destino ({x1},{y1}) não toca a borda de {e['to']}")

        # G-SEGM: segmentos não atravessam nós não-extremos (forma real)
        for e in fedges:
            pts = e["path"]
            for k in range(len(pts) - 1):
                (ax, ay), (bx, by) = pts[k], pts[k + 1]
                for n in fnodes:
                    if n["id"] in (e["from"], e["to"]):
                        continue
                    if box_hits_node(ax, ay, bx, by, n, R[n["id"]], samples=60):
                        errors.append(
                            f"{e['id']}: segmento atravessa o nó {n['id']}")
                        break

        # G-CROSS: cruzamentos entre conectores
        def segments_of(e):
            return [(e["path"][i], e["path"][i + 1]) for i in range(len(e["path"]) - 1)]

        def orient(a, b):
            return "H" if abs(a[1] - b[1]) < 0.01 else "V"

        for i in range(len(fedges)):
            for j in range(i + 1, len(fedges)):
                ea, eb = fedges[i], fedges[j]
                for (a1, a2) in segments_of(ea):
                    for (b1, b2) in segments_of(eb):
                        if orient(a1, a2) == orient(b1, b2):
                            continue
                        hseg, vseg = ((a1, a2), (b1, b2)) if orient(a1, a2) == "H" else ((b1, b2), (a1, a2))
                        hy = hseg[0][1]
                        vx = vseg[0][0]
                        hxs = sorted((hseg[0][0], hseg[1][0]))
                        vys = sorted((vseg[0][1], vseg[1][1]))
                        eps = 1.0
                        if hxs[0] + eps < vx < hxs[1] - eps and vys[0] + eps < hy < vys[1] - eps:
                            errors.append(
                                f"cruzamento: {ea['id']} × {eb['id']} em ({vx:.0f},{hy:.0f})")

        # G-LABEL: rótulos dentro da área segura e sem colisão (forma real)
        f = FRAMES[frame]
        for e in fedges:
            lb = e.get("label")
            if not lb:
                continue
            lw = text_metrics(lb["text"], MIN_FONT, "Regular")[0]
            lx0, lx1 = lb["x"], lb["x"] + lw
            ly0, ly1 = lb["y"], lb["y"] + MIN_FONT * LINE_H
            if lx0 < 24 or ly0 < 24 or lx1 > f["w"] - 24 or ly1 > f["h"] - 24:
                errors.append(f"{e['id']}: rótulo fora da área segura do frame")
            for n in fnodes:
                if box_hits_node(lx0, ly0, lx1, ly1, n, R[n["id"]]):
                    errors.append(f"{e['id']}: rótulo colide com o nó {n['id']}")
    return errors


# ---------------------------------------------------------------- validação lógica
def check_logic(nodes, edges):
    """Validação lógica POR FRAME (cada fluxo é independente)."""
    errors = []
    for frame in sorted({n["frame"] for n in nodes}):
        fnodes = [n for n in nodes if n["frame"] == frame]
        fedges = [e for e in edges if e["frame"] == frame]
        ids = {n["id"] for n in fnodes}
        starts = [n for n in fnodes if n["type"] == "terminal_start"]
        if len(starts) != 1:
            errors.append(f"[{frame}] exatamente 1 terminal inicial exigido "
                          f"(há {len(starts)})")
        outs, ins = {}, {}
        for e in fedges:
            if e["from"] not in ids or e["to"] not in ids:
                errors.append(f"[{frame}] {e['id']}: aresta pendente (nó inexistente)")
                continue
            outs.setdefault(e["from"], []).append(e)
            ins.setdefault(e["to"], []).append(e)
        for n in fnodes:
            o = outs.get(n["id"], [])
            if n["type"] == "decision":
                if len(o) < 2:
                    errors.append(f"[{frame}] {n['id']}: decisão com {len(o)} saídas (<2)")
                for e in o:
                    if not e.get("label"):
                        errors.append(f"[{frame}] {n['id']}: saída {e['id']} sem rótulo")
            # terminais, saídas, notas e conectores off-page de saída não exigem saída
            elif n["type"] not in ("terminal_end", "terminal_exit", "note_ref",
                                   "offpage_out"):
                if not o:
                    errors.append(f"[{frame}] {n['id']}: nó não-terminal sem saída")
        if not any(n["type"] in ("terminal_end", "terminal_exit") for n in fnodes):
            errors.append(f"[{frame}] nenhum terminal de fim/saída")
        if starts:
            # pares off-page (mesmo rótulo) funcionam como aresta lógica
            out_labels = {n["texts"][0][0]: n["id"] for n in fnodes
                          if n["type"] == "offpage_out"}
            seen, stack = set(), [starts[0]["id"]]
            while stack:
                cur = stack.pop()
                if cur in seen:
                    continue
                seen.add(cur)
                for e in outs.get(cur, []):
                    stack.append(e["to"])
                if cur in out_labels.values():
                    for n in fnodes:
                        if n["type"] == "offpage_in" and \
                           n["texts"][0][0] in out_labels:
                            stack.append(n["id"])
            for n in fnodes:
                if n["id"] not in seen:
                    errors.append(f"[{frame}] {n['id']}: nó inalcançável a partir do início")
    return errors


# ---------------------------------------------------------------- montagem
def build_manifest():
    nodes = NODES
    edges = EDGES
    logic_errors = check_logic(nodes, edges)
    geo_errors = check_geometry(nodes, edges)
    fit_errors = []
    planned_texts = {}
    for n in nodes:
        wrapped, errs = plan_node(n)
        planned_texts[n["id"]] = wrapped
        fit_errors.extend(errs)
    all_errors = logic_errors + geo_errors + fit_errors

    manifest = {
        "version": "02A.2-V2",
        "generated": "2026-10-17",
        "grid": dict(min_pad_h=MIN_PAD_H, min_pad_v=MIN_PAD_V,
                     min_font=MIN_FONT, title_font=TITLE_FONT, min_gap_v=MIN_GAP_V),
        "line_language": {k: dict(v) for k, v in LINE_STYLES.items()},
        "frames": FRAMES,
        "nodes": [dict(n, style=node_style(n),
                       texts_planned=[[(" ".join(ln), sz, wt) for ln in lines]
                                      for (lines, sz, wt) in planned_texts[n["id"]]])
                  for n in nodes],
        "edges": [dict(e, style=LINE_STYLES[e["kind"]]) for e in edges],
        "validation": dict(logic_errors=logic_errors,
                           geometry_errors=geo_errors,
                           text_fit_errors=fit_errors),
    }
    return manifest, all_errors


def main():
    manifest, errors = build_manifest()
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=1)
    n_nodes = len(manifest["nodes"])
    n_edges = len(manifest["edges"])
    print(f"manifest: {MANIFEST}")
    print(f"nós: {n_nodes} | arestas: {n_edges}")
    if errors:
        print(f"ERROS DE PLANEJAMENTO: {len(errors)}")
        for e in errors:
            print("  -", e)
        sys.exit(1)
    print("PLANEJAMENTO OK — 0 erros lógicos, 0 geométricos, 0 de ajuste de texto")


if __name__ == "__main__":
    main()
