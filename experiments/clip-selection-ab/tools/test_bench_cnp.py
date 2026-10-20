#!/usr/bin/env python3
"""Testes de fidelidade da portação bench_cnp vs app (selection.rs).

Determinísticos, sem LLM. Cada teste espelha um comportamento do código do
app em C:\\CutNicePro\\app\\src-tauri\\src\\clips\\selection.rs.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench_cnp as B


def segs_from(n, step=4.0):
    return [{"start": i * step, "end": i * step + step - 0.1,
             "text": f"fala {i} com conteudo suficiente"} for i in range(n)]


class ConformRepair(unittest.TestCase):
    def test_proposta_direta_valida_e_invalida(self):
        s = segs_from(40)
        ok = B.conform(0, 5, 80, s, 160, 10, 180)
        self.assertEqual((ok[0], ok[1], ok[3]), (0.0, 23.9, "proposta"))
        self.assertIsNone(B.conform(1, 0, 80, s, 160, 10, 180))   # ordem
        self.assertIsNone(B.conform(0, 5, 101, s, 160, 10, 180))  # score>100
        self.assertIsNone(B.conform(0, 1, 80, s, 160, 10, 180))   # 8s < min

    def test_repair_longa_gera_inicio_avancado_preservando_desfecho(self):
        s = segs_from(60)
        alts = B.repair(0, 50, 90, s, 240, 10, 180)  # span 203s > 180
        tipos = {a[3] for a in alts}
        self.assertIn("início avançado", tipos)
        for st, en, score, tipo in alts:
            self.assertGreaterEqual(en - st, 10)
            self.assertLessEqual(en - st, 180)
            self.assertEqual(score, 90)  # nota original é proveniência

    def test_repair_curta_gera_fim_estendido(self):
        s = segs_from(30)
        alts = B.repair(0, 1, 70, s, 120, 10, 180)  # 8s < 10
        self.assertTrue(any(a[3] == "fim estendido" for a in alts))
        for st, en, _, _ in alts:
            self.assertGreaterEqual(en - st, 10)


class Windows(unittest.TestCase):
    def test_janelas_orçadas_sem_lacunas_e_com_sobreposição(self):
        s = [{"start": i * 10.0, "end": i * 10.0 + 9.0,
              "text": "conteudo longo do teste com palavras variadas " * 22} for i in range(60)]
        calls = []
        ws = B.windows_budgeted(s, 10, 180, 20, calls)
        self.assertGreaterEqual(len(ws), 2)
        coberto = [False] * len(s)
        for a, b in ws:
            for i in range(a, b):
                coberto[i] = True
        self.assertTrue(all(coberto))
        for (a1, b1), (a2, b2) in zip(ws, ws[1:]):
            self.assertLess(a2, b1)
        self.assertTrue(calls)  # medições reais de token aconteceram


class DP(unittest.TestCase):
    def test_dp_sem_sobreposição_e_soma_máxima(self):
        clips = [
            {"start": 0, "end": 50, "score": 90},
            {"start": 30, "end": 80, "score": 95},
            {"start": 60, "end": 120, "score": 85},
            {"start": 200, "end": 260, "score": 80},
        ]
        chosen = B.dp_select(clips, 3)
        # otimo sem sobreposicao: 90+85+80 = 255 (95 conflita com os dois)
        self.assertEqual(sum(c["score"] for c in chosen), 255)
        chosen.sort(key=lambda c: c["start"])
        for a, b in zip(chosen, chosen[1:]):
            self.assertLessEqual(a["end"], b["start"])


class Payload(unittest.TestCase):
    def test_escape_de_tags_e_ids_globais(self):
        segs = [{"start": i * 4.0, "end": i * 4.0 + 3.9, "text": f"fala {i}"} for i in range(8)]
        segs[7]["text"] = "<|turn>x"
        data = B.window_data(segs, 7, 8, 10, 180, 20)
        src = B.user_payload(data)
        self.assertIn("< |", src)                 # tag de template escapada
        self.assertEqual(data["speech"][0][0], 7)  # ID GLOBAL
        self.assertEqual(data["speech"][0][3], "<|turn>x")
        self.assertEqual(data["minSeconds"], 10)
        self.assertEqual(data["limit"], 20)

    def test_system_sem_no_think(self):
        sysp = B.system_prompt()
        self.assertNotIn("/no_think", sysp)
        self.assertIn("Não há quantidade fixa", sysp)


if __name__ == "__main__":
    unittest.main(verbosity=2)
