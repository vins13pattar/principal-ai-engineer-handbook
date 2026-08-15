"""Running a system under test against a dataset, including repeat runs for flakiness."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from evaluation_platform.dataset import Dataset
from evaluation_platform.graders import Grader

#: A system under test: question in, answer out. `attempt` lets a simulated system be
#: deliberately nondeterministic so flakiness detection has something to find.
System = Callable[[str, int], str]


@dataclass(frozen=True)
class Result:
    example_id: str
    passed: bool
    actual: str


@dataclass(frozen=True)
class Run:
    """One pass over the dataset."""

    label: str
    grader: str
    results: tuple[Result, ...]

    @property
    def total(self) -> int:
        return len(self.results)

    @property
    def correct(self) -> int:
        return sum(r.passed for r in self.results)

    @property
    def accuracy(self) -> float:
        return self.correct / self.total if self.total else 0.0


def run_once(
    system: System,
    dataset: Dataset,
    grader: Grader,
    *,
    label: str,
    attempt: int = 0,
) -> Run:
    """One pass over the dataset, calling the system exactly once per example.

    Calling it twice — once to grade, once to record the output — is a real bug on a
    nondeterministic system: the recorded `actual` would then describe a different call
    from the one that produced `passed`, and every flaky failure would be
    un-investigable. This lab is partly about flakiness, so it cannot afford that.
    """
    results = []
    for example in dataset.examples:
        actual = system(example.question, attempt)
        results.append(Result(example.example_id, grader.grade(actual, example.expected), actual))
    return Run(label=label, grader=grader.name, results=tuple(results))


@dataclass(frozen=True)
class FlakinessReport:
    """Which examples did not return the same verdict across repeats.

    A flaky example is worse than a failing one: it makes every delta partly noise, and
    averaging it away hides the instability instead of reporting it.
    """

    unstable: tuple[str, ...]
    repeats: int
    total: int

    @property
    def unstable_fraction(self) -> float:
        return len(self.unstable) / self.total if self.total else 0.0


def detect_flakiness(
    system: System, dataset: Dataset, grader: Grader, *, repeats: int = 5
) -> FlakinessReport:
    """Run the same dataset several times and report examples whose verdict moved."""
    verdicts: dict[str, set[bool]] = {e.example_id: set() for e in dataset.examples}
    for attempt in range(repeats):
        for result in run_once(system, dataset, grader, label="flake", attempt=attempt).results:
            verdicts[result.example_id].add(result.passed)

    unstable = tuple(sorted(eid for eid, seen in verdicts.items() if len(seen) > 1))
    return FlakinessReport(unstable=unstable, repeats=repeats, total=len(dataset))
