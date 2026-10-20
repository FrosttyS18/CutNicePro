#!/usr/bin/env python3
"""Synthetic counterexamples only; does not load or modify CutNicePro.

Enumerates all feasible subsets as an independent reference. No LLM, video,
network, third-party dependency, or claim to execute the user's Rust code.
Run: python contraprovas_selecao.py [--out results.json]
"""
from __future__ import annotations
import argparse
import itertools
import json
from dataclasses import asdict, dataclass
from pathlib import Path

@dataclass(frozen=True)
class Clip:
    name: str
    start: int
    end: int
    score: int

    def __post_init__(self) -> None:
        if self.start < 0 or self.end <= self.start or not 0 <= self.score <= 100:
            raise ValueError('Invalid synthetic clip')

def compatible(clips: tuple[Clip, ...] | list[Clip]) -> bool:
    # Half-open intervals; touching endpoints are allowed.
    ordered = sorted(clips, key=lambda c: (c.start, c.end, c.name))
    return all(a.end <= b.start for a, b in zip(ordered, ordered[1:]))

def oracle(pool: list[Clip], count: int, cardinality_first: bool = False) -> list[Clip]:
    if count < 0:
        raise ValueError('count must be nonnegative')
    best: tuple[Clip, ...] = ()
    best_value = (-1, -1)
    for size in range(min(count, len(pool)) + 1):
        for subset in itertools.combinations(pool, size):
            if not compatible(subset):
                continue
            weight = sum(c.score for c in subset)
            value = (size, weight) if cardinality_first else (weight, size)
            if value > best_value:
                best, best_value = subset, value
    return sorted(best, key=lambda c: (c.start, c.end, c.name))

def overlap(a: Clip, b: Clip, denominator: str) -> float:
    intersection = max(0, min(a.end, b.end) - max(a.start, b.start))
    length_a, length_b = a.end - a.start, b.end - b.start
    if denominator == 'iou':
        divisor = length_a + length_b - intersection
    elif denominator == 'shorter':
        divisor = min(length_a, length_b)
    elif denominator == 'longer':
        divisor = max(length_a, length_b)
    else:
        raise ValueError('Unknown overlap denominator')
    return intersection / divisor

def suppress(pool: list[Clip], denominator: str) -> list[Clip]:
    kept: list[Clip] = []
    for clip in sorted(pool, key=lambda c: (-c.score, c.start, c.end, c.name)):
        if all(overlap(clip, other, denominator) < 0.5 for other in kept):
            kept.append(clip)
    return kept

def summary(clips: list[Clip]) -> dict:
    return {'ids': [c.name for c in clips], 'count': len(clips),
            'sum_of_supplied_scores': sum(c.score for c in clips)}

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    # All three candidates satisfy the reported 15-90 second duration range.
    pool = [Clip('longo', 0, 60, 90), Clip('esquerda', 0, 30, 75),
            Clip('direita', 30, 60, 75)]
    optimal = oracle(pool, 2)
    assert summary(optimal)['sum_of_supplied_scores'] == 150
    variants = {}
    for ratio in ('iou', 'shorter', 'longer'):
        after = oracle(suppress(pool, ratio), 2)
        assert summary(after) == {'ids': ['longo'], 'count': 1, 'sum_of_supplied_scores': 90}
        variants[ratio] = summary(after)
    counter_count = [Clip('longo', 0, 60, 100), Clip('esquerda', 0, 30, 49),
                     Clip('direita', 30, 60, 49)]
    best_sum, best_count = oracle(counter_count, 2), oracle(counter_count, 2, True)
    assert len(best_sum) == 1 and len(best_count) == 2
    result = {
        'scope': 'Independent synthetic enumeration; not the experimental Rust implementation',
        'llm_calls': 0,
        'dedupe_can_destroy_optimal_solution': {
            'candidates': [asdict(c) for c in pool],
            'without_pruning': summary(optimal),
            'after_highest_score_overlap_suppression_at_50_percent': variants,
        },
        'max_sum_is_not_max_count': {
            'candidates': [asdict(c) for c in counter_count],
            'max_sum_at_most_two': summary(best_sum),
            'max_count_then_sum': summary(best_count),
            'interpretation': 'These are different product objectives, not an implementation bug by themselves',
        },
        'editorial_quality': 'NOT MEASURED; supplied scores are synthetic weights, not human ratings',
    }
    output = json.dumps(result, indent=2)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(output + '\n', encoding='utf-8')
    print(output)

if __name__ == '__main__':
    main()
