#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CutNicePro — Fase 02A.3 — Quality Gate V3 (5 dimensões).

  A — Integridade lógica   (check_logic: arestas, decisões, alcançabilidade)
  B — Geometria            (check_geometry + plan_node: losangos 1:1 ±2%,
                            texto na ÁREA REAL INSCRITA do losango, contatos,
                            sobreposições, cruzamentos, fontes >= 14 px)
  C — Identidade visual    (check_identity: tokens por função — canvas
                            #000000, superfícies #231F20/#2B2728, accent
                            #02C2BE, texto #E6E7E8/#B9BBBD, semânticas
                            provisórias #E5484D/#F5A524, Poppins)
  D — Rastreabilidade semântica (check_semantic: o ID existe E corresponde
                            ao comportamento do nó — keywords dos títulos
                            canônicos de USER-JOURNEYS.md; BR/DEC exigem
                            existência nos canônicos)
  E — Fidelidade FigCraft  (check_docdump: documento real == modelo —
                            bounds ±1.5 px, VECTOR nativos, dashes, fontes,
                            famílias, fills/tokens e background do canvas)

Teste negativo (--selftest): 12 defeitos injetados DEVEM ser detectados.
"""
import copy
import json
import os
import re
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import flow_model_v2 as M  # noqa: E402

ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
DUMPS = {
    "00": os.path.join(ROOT, "design", "flow-v2", "docdump-00.json"),
    "01": os.path.join(ROOT, "design", "flow-v2", "docdump-01.json"),
}
JOURNEYS = os.path.join(ROOT, "docs", "product", "USER-JOURNEYS.md")
BUSINESS = os.path.join(ROOT, "docs", "product", "BUSINESS-RULES.md")
DECISIONS = os.path.join(ROOT, "docs", "product", "DECISIONS.md")

# ---- C — Identidade visual (tokens oficiais design/tokens/tokens.json) -----
CANVAS_BG = "#000000"                 # Pure Black — background principal
SURFACES = {"#231F20", "#2B2728"}     # Attractive Black / surface-raised
ACCENT = "#02C2BE"                    # Deep Aqua
TEXT_MAIN = "#E6E7E8"                 # White Marble
TEXT_AUX = "#B9BBBD"                  # marble70
BORDER = "#3A3A3C"
SEM_ERROR = "#E5484D"                 # semântica provisória (WCAG pendente)
SEM_PENDING = "#F5A524"               # semântica provisória (WCAG pendente)

# ---- D — Rastreabilidade semântica ------------------------------------------
SEMANTIC_KEYWORDS = {
    "JRN-001": r"primeira|execu|abertura|ambiente",
    "JRN-002": r"home|recorrente|biblioteca",
    "JRN-003": r"cria|projeto",
    "JRN-004": r"import|m[íi]dia|v[íi]deo",
    "JRN-005": r"escolha|modo",
    "JRN-006": r"config",
    "JRN-007": r"process",
    "JRN-008": r"result|revis",
    "JRN-009": r"editor|edi[çc]",
    "JRN-010": r"export",
    "JRN-011": r"continuidade|manuten",
    "JRN-012": r"compra|ativa|assinatura|licen",
    "JRN-013": r"\bia\b|local|byok|config",
    "JRN-014": r"diagn|exce|repetir|compat",
}
POINTER_TYPES = {"note_ref", "offpage_out", "offpage_in", "terminal_start",
                 "terminal_end", "terminal_exit"}

# ---- Z — Contrato de ordem visual (Fase 02A.4) ------------------------------
# Empilhamento validado no documento REAL (children = stacking bottom-first,
# provado empiricamente em aba descartável com node.reorder):
#   CAMADA INFERIOR: superfícies/formas opacas (frames de nó, losangos,
#                    elipses, chips)
#   CAMADA INTERMÉDIARIA: conectores (vetores abertos = traço)
#   CAMADA SUPERIOR: textos, rótulos SIM/NÃO, anotações
# Regras verificadas: (Z1) texto nunca sob forma opaca que o cubra;
# (Z2) rótulo nunca atravessado por traço de conector acima dele
# (o traço só é violação se atingir a ÁREA DE TINTA estimada dos glifos,
# não o padding da caixa).
ZTEST_POS = os.path.join(ROOT, "design", "flow-v2", "ztest-positivo.json")
ZTEST_NEG = os.path.join(ROOT, "design", "flow-v2", "ztest-negativo.json")


def _text_ink_box(layer):
    """Caixa de tinta estimada (glifos) de um texto: largura por caractere."""
    b = layer.get("absoluteBounds") or {}
    x, y, w, h = b.get("x"), b.get("y"), b.get("width") or 0, b.get("height") or 0
    if x is None:
        return None
    chars = layer.get("characters")
    size = layer.get("fontSize") or 14
    if chars:
        bold = (layer.get("fontStyle") == "Bold")
        ink_w = min(w, len(chars) * size * (0.68 if bold else 0.62))
        pad = (w - ink_w) / 2  # textos centrais; à esquerda ficam colados
        align = layer.get("textAlign")
        if align == "center":
            x0 = x + pad
        elif align == "right":
            x0 = x + (w - ink_w)
        else:
            x0 = x
        return (x0, y, x0 + ink_w, y + h)
    return (x, y, x + w, y + h)


def _seg_hits_box(seg, box, margin):
    (x0, y0), (x1, y1) = (seg[0], seg[1]), (seg[2], seg[3]
                                            ) if len(seg) == 4 else (seg[:2], seg[2:])
    bx0, by0, bx1, by1 = box
    h = abs(y1 - y0) < 0.01
    v = abs(x1 - x0) < 0.01
    if h:
        return (by0 - margin) <= y0 <= (by1 + margin) and \
            min(x0, x1) < bx1 and max(x0, x1) > bx0
    if v:
        return (bx0 - margin) <= x0 <= (bx1 + margin) and \
            min(y0, y1) < by1 and max(y0, y1) > by0
    # diagonal: amostra
    for t in range(21):
        px = x0 + (x1 - x0) * t / 20
        py = y0 + (y1 - y0) * t / 20
        if bx0 - margin <= px <= bx1 + margin and by0 - margin <= py <= by1 + margin:
            return True
    return False


def _opaque_covers(layer, box):
    """Forma opaca cobre a caixa? (losango usa geometria real)."""
    b = layer.get("absoluteBounds") or {}
    x, y = b.get("x"), b.get("y")
    w, h = b.get("width") or 0, b.get("height") or 0
    if x is None:
        return False
    bx0, by0, bx1, by1 = box
    if bx1 <= x or bx0 >= x + w or by1 <= y or by0 >= y + h:
        return False  # bbox disjunto
    if layer.get("shape") == "diamond":
        cx, cy = x + w / 2, y + h / 2
        hw, hh = w / 2, h / 2
        pts = [(bx0, by0), (bx1, by0), (bx0, by1), (bx1, by1),
               ((bx0 + bx1) / 2, (by0 + by1) / 2)]
        return any(abs(px - cx) / hw + abs(py - cy) / hh <= 1.0 for px, py in pts)
    return True  # frame/elipse/fechado: bbox opaco


def check_zorder(dump, frame_label, errors):
    """Z — ordem EFETIVA de renderização no documento real."""
    children = dump.get("children") or []
    for i, layer in enumerate(children):
        if layer.get("type") != "TEXT":
            continue
        ink = _text_ink_box(layer)
        if not ink:
            continue
        name = layer.get("name")
        for j in range(i + 1, len(children)):
            above = children[j]
            aname = above.get("name")
            atype = above.get("type")
            verts = above.get("vertices") or 0
            closed = (not above.get("open", True)) or \
                (verts > 0 and above.get("segments") == verts)
            if atype in ("FRAME", "ELLIPSE") or (atype == "VECTOR" and closed):
                shape = dict(above)
                if shape.get("shape") is None and verts == 4:
                    shape["shape"] = "diamond"  # 4 vértices fechados = losango
                if above.get("fills") and _opaque_covers(shape, ink):
                    errors.append(f"[{frame_label}] Z1: texto '{name}' encoberto "
                                  f"pela forma opaca '{aname}' (acima na ordem)")
            elif atype == "VECTOR":
                segs = above.get("segs") or []
                margin = (above.get("weight") or 1.5) / 2 + 1.0
                for seg in segs:
                    if _seg_hits_box(seg, ink, margin):
                        errors.append(f"[{frame_label}] Z2: rótulo '{name}' "
                                      f"atravessado pelo conector '{aname}' "
                                      "(traço acima do texto)")
    return errors


def run_lg(nodes, edges):
    errors = list(M.check_logic(nodes, edges))
    errors += M.check_geometry(nodes, edges)
    for n in nodes:
        _, errs = M.plan_node(n)
        errors += errs
    return errors


def strip(nodes, edges):
    n2 = [dict(id=n["id"], frame=n["frame"], type=n["type"], x=n["x"], y=n["y"],
               w=n["w"], h=n["h"], texts=n["texts"], accent=n.get("accent"),
               ref=n.get("ref"))
          for n in nodes]
    e2 = []
    for e in edges:
        d = dict(id=e["id"], frame=e["frame"], kind=e["kind"],
                 path=[list(p) for p in e["path"]], label=None)
        d["from"], d["to"] = e["from"], e["to"]
        if e.get("label"):
            d["label"] = dict(e["label"])
        e2.append(d)
    return n2, e2


def check_identity(nodes, edges):
    """C — tokens por função no modelo (o documento é conferido em E)."""
    errors = []
    ok_strokes = {ACCENT, BORDER, SEM_ERROR, SEM_PENDING, TEXT_AUX}
    ok_line_colors = {ACCENT, TEXT_AUX, TEXT_MAIN, SEM_ERROR, SEM_PENDING}
    for n in nodes:
        st = M.node_style(n)
        fill = st.get("fill")
        if n["type"] == "terminal_start":
            if fill != ACCENT:
                errors.append(f"C: {n['id']} terminal inicial fora do accent "
                              f"({fill} != {ACCENT})")
        elif fill is not None and fill not in SURFACES:
            errors.append(f"C: {n['id']} superfície {fill} fora dos tokens "
                          f"{sorted(SURFACES)}")
        stroke = st.get("stroke")
        if stroke is not None and stroke not in ok_strokes:
            errors.append(f"C: {n['id']} stroke {stroke} fora dos tokens")
    for e in edges:
        st = M.LINE_STYLES[e["kind"]]
        if st["color"] not in ok_line_colors:
            errors.append(f"C: conector {e['id']} cor {st['color']} fora dos tokens")
    if M.FONT != "Poppins":
        errors.append("C: tipografia do modelo não é Poppins")
    return errors


def canonical_ids():
    jrns, brs, decs = set(), set(), set()
    if os.path.exists(JOURNEYS):
        text = open(JOURNEYS, encoding="utf-8").read()
        jrns = set(re.findall(r"^## (JRN-\d+)", text, re.M))
    if os.path.exists(BUSINESS):
        text = open(BUSINESS, encoding="utf-8").read()
        brs = set(re.findall(r"\b(BR-\d+)\b", text))
    if os.path.exists(DECISIONS):
        text = open(DECISIONS, encoding="utf-8").read()
        decs = set(re.findall(r"\b(DEC-\d+)\b", text))
    return jrns, brs, decs


def check_semantic(nodes):
    """D — o ID existe E corresponde semanticamente ao nó."""
    errors = []
    jrns, brs, decs = canonical_ids()
    if not jrns:
        errors.append(f"D: canônicos não encontrados ({JOURNEYS})")
        return errors
    pools = {"JRN": jrns, "BR": brs, "DEC": decs}
    for n in nodes:
        ref = n.get("ref")
        if not ref:
            continue
        prefix = ref.split("-")[0]
        if prefix not in pools or ref not in pools[prefix]:
            errors.append(f"D: {n['id']} referencia {ref} inexistente nos canônicos")
            continue
        if prefix != "JRN" or n["type"] in POINTER_TYPES:
            continue  # BR/DEC e ponteiros: exige existência
        kw = SEMANTIC_KEYWORDS.get(ref)
        if not kw:
            errors.append(f"D: {ref} sem keyword canônica mapeada no gate")
            continue
        blob = " ".join(t[0] for t in n["texts"]).lower()
        if not re.search(kw, blob):
            errors.append(f"D: {n['id']} referencia {ref} sem correspondência "
                          f"semântica (keywords '{kw}' ausentes)")
    return errors


def check_docdump(manifest, errors, dumps=None):
    dumps = dumps or DUMPS
    for frame, path in dumps.items():
        if not os.path.exists(path):
            errors.append(f"[{frame}] E: docdump ausente: {path}")
            continue
        with open(path, encoding="utf-8") as fh:
            dump = json.load(fh)
        layers = {}

        def walk(node):
            layers[node.get("name")] = node
            for c in node.get("children") or []:
                walk(c)

        walk(dump)
        fmeta = manifest["frames"][frame]
        fx, fy = fmeta["x"], fmeta["y"]
        root_fill = (dump.get("fills") or [{}])[0].get("color")
        if root_fill != CANVAS_BG:
            errors.append(f"[{frame}] E: background {root_fill} != {CANVAS_BG} "
                          "(Pure Black)")
        check_zorder(dump, frame, errors)  # Z — ordem efetiva real
        for n in [n for n in manifest["nodes"] if n["frame"] == frame]:
            layer = layers.get(n["id"])
            if layer is None:
                errors.append(f"[{frame}] E: nó {n['id']} não existe no documento")
                continue
            b = layer.get("absoluteBounds") or {}
            exp = (fx + n["x"], fy + n["y"], n["w"], n["h"])
            got = (b.get("x"), b.get("y"), b.get("width"), b.get("height"))
            if any(g is None for g in got) or any(
                    abs(a - g) > 1.5 for a, g in zip(exp, got)):
                errors.append(f"[{frame}] E: {n['id']} bounds {got} != {exp}")
            st = n.get("style") or {}
            if st.get("fill") and layer.get("fills"):
                df = (layer["fills"] or [{}])[0].get("color")
                if df != st["fill"]:
                    errors.append(f"[{frame}] E: {n['id']} fill {df} != token "
                                  f"{st['fill']}")
        for e in [e for e in manifest["edges"] if e["frame"] == frame]:
            layer = layers.get(e["id"])
            if layer is None:
                errors.append(f"[{frame}] E: conector {e['id']} não existe")
                continue
            if layer.get("type") != "VECTOR":
                errors.append(f"[{frame}] E: {e['id']} não é VECTOR")
            style = e.get("style") or {}
            if style.get("dashes") and not layer.get("dashes"):
                errors.append(f"[{frame}] E: {e['id']} tracejado não aplicado")
        for name, layer in layers.items():
            if layer.get("type") == "TEXT":
                fs = layer.get("fontSize")
                if fs is not None and fs < M.MIN_FONT:
                    errors.append(f"[{frame}] E: texto {name} fonte {fs}px < "
                                  f"{M.MIN_FONT}px")
                ff = layer.get("fontFamily")
                if ff is not None and ff != "Poppins":
                    errors.append(f"[{frame}] E: texto {name} família {ff} != Poppins")


# ---------------------------------------------------------------- teste negativo
def _build_fake_dump(bg="#000000", shift=None):
    children = []
    for n in M.NODES:
        if n["frame"] != "00":
            continue
        x, y = n["x"], n["y"]
        if shift and n["id"] == shift[0]:
            x += shift[1]
        st = M.node_style(n)
        children.append({"name": n["id"], "type": "FRAME",
                         "absoluteBounds": {"x": 2460 + x, "y": -123 + y,
                                            "width": n["w"], "height": n["h"]},
                         "fills": [{"color": st.get("fill") or "#231F20"}]})
    for e in M.EDGES:
        if e["frame"] != "00":
            continue
        xs = [p[0] for p in e["path"]]
        ys = [p[1] for p in e["path"]]
        children.append({"name": e["id"], "type": "VECTOR",
                         "absoluteBounds": {"x": 2460 + min(xs),
                                            "y": -123 + min(ys),
                                            "width": max(xs) - min(xs),
                                            "height": max(ys) - min(ys)},
                         "dashes": M.LINE_STYLES[e["kind"]]["dashes"]})
    return {"name": "00 — PRODUCT FLOW OVERVIEW V2", "type": "FRAME",
            "fills": [{"color": bg}], "children": children}


def _write_fake(path, **mut):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(_build_fake_dump(**mut), fh)
    return path


def selftest():
    tmp = tempfile.gettempdir()
    fake = _write_fake(os.path.join(tmp, "fake-dump-00.json"))
    fake_bg = _write_fake(os.path.join(tmp, "fake-dump-bg.json"), bg="#231F20")
    fake_shift = _write_fake(os.path.join(tmp, "fake-dump-shift.json"),
                             shift=("OV-P4", 12))
    manifest = {"frames": M.FRAMES,
                "nodes": [dict(n, style=M.node_style(n)) for n in M.NODES],
                "edges": [dict(e, style=M.LINE_STYLES[e["kind"]]) for e in M.EDGES]}

    def case(name, expect, mutate_nodes=None, mutate_edges=None,
             semantic=False, identity=False, dumps=None):
        nodes, edges = strip(M.NODES, M.EDGES)
        if mutate_nodes:
            mutate_nodes(nodes)
        if mutate_edges:
            mutate_edges(edges)
        errs = run_lg(nodes, edges)
        if semantic:
            errs += check_semantic(nodes)
        if identity:
            errs += check_identity(nodes, edges)
        if dumps:
            check_docdump(manifest, errs, dumps=dumps)
        ok = any(expect in e for e in errs)
        sample = next((e for e in errs if expect in e), "")
        print(f"  [{'DETECTADO' if ok else 'FALHOU'}] {name}"
              + (f" → {sample}" if ok else ""))
        return 0 if ok else 1

    print("SELFTEST — teste negativo do gate V3 (12 defeitos sintéticos + 3 reais, todos DEVEM "
          "ser detectados):")
    fails = 0
    fails += case("aresta pendente (nó inexistente)", "aresta pendente",
                  mutate_edges=lambda es: es[0].update(to="NEXISTE"))
    fails += case("decisão sem segunda saída", "decisão com 1 saídas",
                  mutate_edges=lambda es: [e for e in es
                                           if e["id"] == "E07" and es.remove(e)])
    fails += case("nó sobreposto (N06 sobre N05)", "sobreposição de nós",
                  mutate_nodes=lambda ns: [n.update(y=n["y"] - 100)
                                           for n in ns if n["id"] == "N06"])
    fails += case("conector desconectado", "não toca a borda",
                  mutate_edges=lambda es: [
                      e["path"][-1].__setitem__(0, e["path"][-1][0] + 30)
                      or e["path"][-1].__setitem__(1, e["path"][-1][1] + 30)
                      for e in es if e["id"] == "E03"])
    fails += case("nó inalcançável", "inalcançável",
                  mutate_edges=lambda es: [e for e in es
                                           if e["id"] == "E04" and es.remove(e)])
    fails += case("fonte abaixo do mínimo", "fonte 12px",
                  mutate_nodes=lambda ns: [n.update(
                      texts=[(n["texts"][0][0], 12, n["texts"][0][2])]
                      + list(n["texts"][1:])) for n in ns if n["id"] == "N02"])
    fails += case("losango deformado (N03 1,4x)", "fora de 1:1",
                  mutate_nodes=lambda ns: [n.update(w=336)
                                           for n in ns if n["id"] == "N03"])
    fails += case("texto fora da área real do losango", "área real do losango",
                  mutate_nodes=lambda ns: [n.update(
                      texts=[("Repetir verificação agora?", 15, "Bold")])
                      for n in ns if n["id"] == "N06"])
    fails += case("background incorreto (#231F20 no canvas)", "background",
                  dumps={"00": fake_bg, "01": fake})
    fails += case("fill de nó fora do token", "fill",
                  dumps={"00": _mutate_fill(fake), "01": fake})
    fails += case("referência semântica incorreta (JRN-009 em Importar)",
                  "correspondência semântica", semantic=True,
                  mutate_nodes=lambda ns: [n.update(ref="JRN-009")
                                           for n in ns if n["id"] == "OV-P4"])
    fails += case("divergência modelo × documento (OV-P4 +12px)", "bounds",
                  dumps={"00": fake_shift, "01": fake})
    # Z (02A.4) — dumps REAIS do documento FigCraft descartável
    if os.path.exists(ZTEST_POS):
        zpos = []
        with open(ZTEST_POS, encoding="utf-8") as fh:
            check_zorder(json.load(fh), "ZTEST-POS", zpos)
        ok = not zpos
        print(f"  [{'OK' if ok else 'FALHOU'}] Z-teste positivo REAL deve PASSAR "
              "(formas abaixo, textos acima)"
              + ("" if ok else f" → {zpos[0]}"))
        fails += 0 if ok else 1
    if os.path.exists(ZTEST_NEG):
        zneg = []
        with open(ZTEST_NEG, encoding="utf-8") as fh:
            check_zorder(json.load(fh), "ZTEST-NEG", zneg)
        z1 = any("Z1" in e for e in zneg)
        z2 = any("Z2" in e for e in zneg)
        print(f"  [{'DETECTADO' if z1 else 'FALHOU'}] Z1 negativo REAL: texto "
              "encoberto por losango detectado"
              + (f" → {[e for e in zneg if 'Z1' in e][0]}" if z1 else ""))
        print(f"  [{'DETECTADO' if z2 else 'FALHOU'}] Z2 negativo REAL: rótulo "
              "atravessado por conector detectado"
              + (f" → {[e for e in zneg if 'Z2' in e][0]}" if z2 else ""))
        fails += (0 if z1 else 1) + (0 if z2 else 1)
    # Replay permanente da REGRESSÃO REAL da 02A.3: losangos recriados no topo
    # encobriam os textos — o gate DEVE detectar esse estado histórico.
    if os.path.exists(DUMPS["01"]):
        with open(DUMPS["01"], encoding="utf-8") as fh:
            reg = json.load(fh)
        shapes = [c for c in reg["children"] if c.get("shape") == "diamond"]
        reg["children"] = [c for c in reg["children"]
                           if c.get("shape") != "diamond"] + shapes
        rerrs = []
        check_zorder(reg, "REG-02A3", rerrs)
        zr = any("Z1" in e for e in rerrs)
        print(f"  [{'DETECTADO' if zr else 'FALHOU'}] Replay da regressão real "
              "02A.3 (losangos no topo encobrindo textos)"
              + (f" → {len([e for e in rerrs if 'Z1' in e])} textos encobertos "
                 "detectados" if zr else ""))
        fails += 0 if zr else 1
    return fails, 16


def _mutate_fill(fake_path):
    with open(fake_path, encoding="utf-8") as fh:
        dump = json.load(fh)
    dump = copy.deepcopy(dump)
    for c in dump["children"]:
        if c["name"] == "OV-P1":
            c["fills"] = [{"color": "#444444"}]
    out = fake_path.replace(".json", "-fill.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(dump, fh)
    return out


def main():
    if "--selftest" in sys.argv:
        fails, total = selftest()
        print(f"\nselftest: {total - fails}/{total} defeitos detectados")
        sys.exit(1 if fails else 0)

    with open(M.MANIFEST, encoding="utf-8") as fh:
        manifest = json.load(fh)
    nodes, edges = strip(M.NODES, M.EDGES)
    errors = run_lg(nodes, edges)                    # A + B
    errors += check_identity(nodes, edges)           # C
    errors += check_semantic(nodes)                  # D
    model_only = "--model" in sys.argv
    if not model_only:
        check_docdump(manifest, errors)              # E
    print(f"gate V3: {len(nodes)} nós · {len(edges)} arestas · dimensões A-E")
    if errors:
        print(f"FALHAS: {len(errors)}")
        for e in errors:
            print("  -", e)
        sys.exit(1)
    tail = "modelo apenas (documento NÃO verificado)" if model_only else \
        "documento 0 divergências"
    print("GATE V3 PASS — A lógica 0 · B geometria 0 · C identidade 0 · "
          f"D semântica 0 · E {tail}")


if __name__ == "__main__":
    main()
