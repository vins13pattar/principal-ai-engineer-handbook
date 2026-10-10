"""One decision as measured: the probabilities a model gave, and the human label.

Committed results are JSON Lines of these. No source text is stored -- only the
row index into the public dataset, the label, and the probabilities -- so the
results are numbers derived from the data, not a copy of it.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Record:
    dataset: str
    row: int
    label: int
    probs: tuple[float, ...]
    # Whether the model reported dropping part of the question to fit its
    # token budget. With 77 options this is the thing to check first.
    truncated: bool

    @property
    def options(self) -> int:
        return len(self.probs)

    @property
    def predicted(self) -> int:
        return max(range(len(self.probs)), key=self.probs.__getitem__)

    @property
    def top(self) -> float:
        return max(self.probs)

    @property
    def correct(self) -> bool:
        return self.predicted == self.label


def write_jsonl(records: Iterable[Record], path: Path) -> None:
    with path.open("w") as handle:
        for r in records:
            row = {
                "dataset": r.dataset,
                "row": r.row,
                "label": r.label,
                "probs": [round(p, 6) for p in r.probs],
                "truncated": r.truncated,
            }
            handle.write(json.dumps(row, separators=(",", ":")) + "\n")


def read_jsonl(path: Path) -> list[Record]:
    records: list[Record] = []
    with path.open() as handle:
        for line in handle:
            row = json.loads(line)
            records.append(
                Record(
                    dataset=str(row["dataset"]),
                    row=int(row["row"]),
                    label=int(row["label"]),
                    probs=tuple(float(p) for p in row["probs"]),
                    truncated=bool(row["truncated"]),
                )
            )
    return records
