#!/usr/bin/env python3
"""Reproduce only the score-routing loop observed in CutNicePro bc8a198.

This is a Python reproduction of the Rust iteration semantics, not an
execution of the application, its Rust unit tests, or the language model.
Source: app/src-tauri/src/clips/selection.rs, resolve().
"""
from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

SOURCE_COMMIT = "bc8a198f6ea1bd5fe68f9a462b67be290b48a177"
RUST_EXCERPT = """if let Some(contender) = contenders
    .iter_mut()
    .filter(|c| c.valid_score.is_none())
    .nth(position)
{
    contender.clip.score = score;
    contender.valid_score = Some(score);
}"""


def route_like_current_code(
    original: list[dict[str, Any]], evaluations: list[tuple[str, int]]
) -> dict[str, Any]:
    """Equivalent to filtering None again before each nth(position)."""
    contenders = copy.deepcopy(original)
    applied: set[int] = set()
    trace: list[dict[str, Any]] = []
    for label, score in evaluations:
        position = int(label.removeprefix("E")) - 1
        if position in applied:
            continue
        applied.add(position)
        current_pending = [c for c in contenders if c["valid_score"] is None]
        target = current_pending[position] if position < len(current_pending) else None
        trace.append({
            "response_id": label,
            "score": score,
            "pending_before": [c["name"] for c in current_pending],
            "assigned_to": target["name"] if target is not None else None,
        })
        if target is not None:
            target["valid_score"] = score
    return {"trace": trace, "final": contenders}


def expected_routing(
    original: list[dict[str, Any]], evaluations: list[tuple[str, int]]
) -> list[dict[str, Any]]:
    """Independent reference: IDs retain their original target throughout."""
    contenders = copy.deepcopy(original)
    frozen = {f"E{j + 1}": i for j, i in enumerate(
        i for i, c in enumerate(contenders) if c["valid_score"] is None
    )}
    seen: set[str] = set()
    for label, score in evaluations:
        if label not in frozen or label in seen:
            continue
        seen.add(label)
        contenders[frozen[label]]["valid_score"] = score
    return contenders


def run() -> dict[str, Any]:
    base = [
        {"name": "Alternative A", "valid_score": None},
        {"name": "Alternative B", "valid_score": None},
        {"name": "Alternative C", "valid_score": None},
    ]
    ordered = [("E1", 10), ("E2", 90), ("E3", 20)]
    permutations = {
        "ordered": ordered,
        "reversed": list(reversed(ordered)),
        "mixed": [ordered[1], ordered[0], ordered[2]],
    }
    cases = {}
    for name, evaluations in permutations.items():
        observed = route_like_current_code(base, evaluations)
        expected = expected_routing(base, evaluations)
        cases[name] = {**observed, "expected": expected,
                       "routing_correct": observed["final"] == expected}
    assert not cases["ordered"]["routing_correct"]
    assert cases["ordered"]["final"][2]["valid_score"] == 90
    assert cases["ordered"]["final"][1]["valid_score"] is None
    assert cases["reversed"]["routing_correct"]
    assert cases["ordered"]["final"] != cases["reversed"]["final"]

    two = route_like_current_code(base[:2], [("E1", 10), ("E2", 90)])
    assert two["final"][1]["valid_score"] is None
    return {
        "source_commit": SOURCE_COMMIT,
        "scope": "Python reproduction of the inspected score-routing loop only",
        "rust_application_executed": False,
        "model_inference_executed": False,
        "rust_excerpt": RUST_EXCERPT,
        "cases": cases,
        "two_pending": two,
        "conclusion": "The pending filter changes after assignment: IDs can lose or switch their targets.",
    }


if __name__ == "__main__":
    report = run()
    destination = Path(__file__).with_name("resultado_contraprova_ids_ab4.json")
    destination.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
