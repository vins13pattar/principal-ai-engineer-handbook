"""An evaluation harness that can fail, and that says when it cannot answer.

The lab's claim lives in `tests/test_significance.py`: most eval sets are far too small
to see the improvements they are used to justify, and reporting a delta without the
interval around it is not a measurement.
"""

from evaluation_platform.dataset import Dataset, Example
from evaluation_platform.graders import ContainsExpected, ExactMatch, NormalisedMatch
from evaluation_platform.runner import Run, detect_flakiness, run_once
from evaluation_platform.significance import (
    Comparison,
    required_sample_size,
    smallest_detectable_delta,
)

__all__ = [
    "Comparison",
    "ContainsExpected",
    "Dataset",
    "ExactMatch",
    "Example",
    "NormalisedMatch",
    "Run",
    "detect_flakiness",
    "required_sample_size",
    "run_once",
    "smallest_detectable_delta",
]
