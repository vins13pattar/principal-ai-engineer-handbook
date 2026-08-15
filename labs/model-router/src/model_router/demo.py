"""A three-model fleet and a reproducible workload.

Costs and quality figures are lab fixtures chosen for their relative ordering. They
are not benchmarks and not any vendor's pricing.
"""

from __future__ import annotations

from model_router.models import ModelSpec, Task, TaskClass
from model_router.registry import ModelRegistry

SMALL = ModelSpec(
    name="small",
    cost_per_1k_tokens=0.0002,
    supports=frozenset({TaskClass.CLASSIFY, TaskClass.EXTRACT, TaskClass.SUMMARISE}),
    quality={TaskClass.CLASSIFY: 0.92, TaskClass.EXTRACT: 0.80, TaskClass.SUMMARISE: 0.70},
)

MID = ModelSpec(
    name="mid",
    cost_per_1k_tokens=0.0020,
    supports=frozenset(
        {TaskClass.CLASSIFY, TaskClass.EXTRACT, TaskClass.SUMMARISE, TaskClass.REASON}
    ),
    quality={
        TaskClass.CLASSIFY: 0.95,
        TaskClass.EXTRACT: 0.91,
        TaskClass.SUMMARISE: 0.88,
        TaskClass.REASON: 0.72,
    },
)

LARGE = ModelSpec(
    name="large",
    cost_per_1k_tokens=0.0150,
    supports=frozenset(
        {
            TaskClass.CLASSIFY,
            TaskClass.EXTRACT,
            TaskClass.SUMMARISE,
            TaskClass.REASON,
            TaskClass.CODE,
        }
    ),
    quality={
        TaskClass.CLASSIFY: 0.96,
        TaskClass.EXTRACT: 0.94,
        TaskClass.SUMMARISE: 0.93,
        TaskClass.REASON: 0.90,
        TaskClass.CODE: 0.88,
    },
)


def build_registry() -> ModelRegistry:
    return ModelRegistry([SMALL, MID, LARGE])


def build_workload(size: int = 200, task_class: TaskClass = TaskClass.EXTRACT) -> list[Task]:
    """A fixed workload. Same tasks every run, so results are comparable."""
    return [Task(task_id=f"t-{i:04d}", task_class=task_class) for i in range(size)]
