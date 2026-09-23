#!/usr/bin/env python3
"""Rebuild the MEASURED_BANDS table in src/search/exhaustive.ts from exported chain CSVs.

    python3 scripts/analyzeChainCorpus.py ~/Downloads/chains-*.csv

Prints one TypeScript table entry per ascension count, plus the per-run detail behind it, so the
numbers in exhaustive.ts can be audited or replaced rather than trusted. It does not edit the
file: the table there is the union of this output with an older corpus whose CSVs are gone, and
merging that is a judgement call, not a script's.

THE METHOD, and why each piece of it is there.

Near-best set. Every chain within TOLERANCE of that run's best AT THAT ASCENSION COUNT. Counts are
not comparable to each other -- a 6-ascension chain and an 8-ascension one are different questions
-- so each count is measured against its own winner.

Fractions, not TE. A checkpoint is recorded as (checkpoint - currentTE) / (finalTE - currentTE),
because the corpus spans accounts from 132 to 181 TE and the suggestion has to work for an account
in neither place. This is the model's weakest assumption and it is known to break across TARGETS:
on 490 the last checkpoint sits around 0.3-0.6 of the journey, on 300 around 0.8. Hence
SUGGESTION_TARGET_RANGE.

Min/max within a run, unioned across runs. An earlier pass took the median per run and the spread
across runs, which reports a two-TE band whenever its runs happen to agree -- precision a corpus
this size does not have. The plateau is the thing worth describing.

Edge extension. These files are searches, not surveys, and most were run over hand-typed bands. If
a run's near-best set reaches the edge of what that run actually enumerated, the optimum may be
outside the box, so that side is extended by half the explored width, capped at MAX_EXTENSION of
the journey. Runs whose best chain sits on its own upper edge are flagged TRUNCATED in the output:
that run has not found its optimum, it has found the wall.
"""

from __future__ import annotations

import re
import statistics
import sys
from collections import defaultdict
from pathlib import Path

#: Chains this far behind their run's best at the same ascension count count as "near best".
TOLERANCE = 0.01

#: Edge extension never adds more than this fraction of the journey to a band.
MAX_EXTENSION = 0.06

#: Nor less than this, so a run that enumerated one value at a checkpoint still opens up.
MIN_EXTENSION = 0.02

HEADER = re.compile(r"current TE (\d+) -> final target (\d+)")


def load(path: Path) -> tuple[int, int, dict[str, tuple[int, float]]]:
    """(currentTE, finalTE, {chain: (ascensions, total_days)}) for one export.

    Exports carry one row per LEG, so the same chain appears many times; only the first row of
    each is needed, and the rank-1 chain's legs are the only ones with per-leg detail anyway.
    """
    current = final = None
    chains: dict[str, tuple[int, float]] = {}
    with path.open(encoding="utf-8-sig") as handle:
        for line in handle:
            if line.startswith("#"):
                found = HEADER.search(line)
                if found:
                    current, final = int(found.group(1)), int(found.group(2))
                continue
            if line.startswith("rank,"):
                continue
            cells = line.split(",")
            if len(cells) < 5 or not cells[0].isdigit():
                continue
            chain = cells[1].strip()
            if chain not in chains:
                chains[chain] = (int(cells[2]), float(cells[3]))
    if current is None or final is None:
        raise SystemExit(f"{path.name}: no 'current TE X -> final target Y' header line")
    return current, final, chains


def analyse(path: Path):
    current, final, chains = load(path)
    span = final - current
    by_count: dict[int, list[tuple[float, str]]] = defaultdict(list)
    for chain, (ascensions, days) in chains.items():
        by_count[ascensions].append((days, chain))

    for ascensions, priced in sorted(by_count.items()):
        best_days, best_chain = min(priced)
        near = [c for d, c in priced if d <= best_days * (1 + TOLERANCE)]
        explored: list[list[int]] = [[] for _ in range(ascensions - 1)]
        winners: list[list[int]] = [[] for _ in range(ascensions - 1)]
        for _, chain in priced:
            for i, value in enumerate([int(v) for v in chain.split()][:-1]):
                explored[i].append(value)
        for chain in near:
            for i, value in enumerate([int(v) for v in chain.split()][:-1]):
                winners[i].append(value)

        bands = []
        for i in range(ascensions - 1):
            lo, hi = min(winners[i]), max(winners[i])
            floor, ceiling = min(explored[i]), max(explored[i])
            width = (ceiling - floor) / span
            extension = min(max(MIN_EXTENSION, width / 2), MAX_EXTENSION)
            bands.append(
                dict(
                    lo=round(max(0.0, (lo - current) / span - (extension if lo <= floor else 0)), 3),
                    hi=round(min(1.0, (hi - current) / span + (extension if hi >= ceiling else 0)), 3),
                    raw=((lo - current) / span, (hi - current) / span),
                    truncated=int(best_chain.split()[i]) >= ceiling,
                    values=len(set(explored[i])),
                )
            )
        yield dict(
            run=path.name,
            current=current,
            final=final,
            ascensions=ascensions,
            priced=len(priced),
            near=len(near),
            best_days=best_days,
            best_chain=best_chain,
            median=[statistics.median(w) for w in winners],
            bands=bands,
        )


def main(argv: list[str]) -> int:
    paths = [Path(a) for a in argv[1:]]
    if not paths:
        print(__doc__)
        return 2

    runs = defaultdict(list)
    for path in paths:
        for result in analyse(path):
            runs[result["ascensions"]].append(result)

    for ascensions in sorted(runs):
        print(f"\n=== {ascensions} ascensions")
        for r in runs[ascensions]:
            flags = "".join("T" if b["truncated"] else "." for b in r["bands"])
            print(
                f"  {r['run']}  {r['current']} -> {r['final']}  "
                f"{r['priced']:,} priced, {r['near']:,} near-best  "
                f"best {r['best_days']:.2f} d  [{r['best_chain']}]  edges {flags}"
            )
            for i, band in enumerate(r["bands"]):
                note = "  TRUNCATED: best sits on the top of what this run enumerated" if band["truncated"] else ""
                print(
                    f"    {i}: measured {band['raw'][0]:.3f}-{band['raw'][1]:.3f}"
                    f" -> extended {band['lo']:.3f}-{band['hi']:.3f}"
                    f"  ({band['values']} values enumerated){note}"
                )

        width = ascensions - 1
        union = [
            (
                min(r["bands"][i]["lo"] for r in runs[ascensions]),
                max(r["bands"][i]["hi"] for r in runs[ascensions]),
            )
            for i in range(width)
        ]
        accounts = len({r["current"] for r in runs[ascensions]})
        print(f"\n  {ascensions}: {{")
        print("    bands: [")
        for lo, hi in union:
            print(f"      [{round(lo, 3)}, {round(hi, 3)}],")
        print("    ],")
        print(f"    runs: {len(runs[ascensions])},")
        print(f"    accounts: {accounts},  // distinct current TE, which is a proxy and can merge two saves")
        print("  },")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
