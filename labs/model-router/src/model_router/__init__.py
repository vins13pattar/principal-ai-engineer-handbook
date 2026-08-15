"""Task-based model routing, and a measurement of when escalation actually pays.

Capability filtering first, then cost. The lab's claim is comparative and lives in
`tests/test_escalation.py`: escalation is only a saving when the confidence signal it
triggers on carries information about correctness.
"""

from model_router.errors import BudgetExceeded, NoCapableModel
from model_router.models import ModelSpec, RoutingDecision, Task, TaskClass
from model_router.registry import ModelRegistry
from model_router.router import EscalatingRouter, ModelRouter

__all__ = [
    "BudgetExceeded",
    "EscalatingRouter",
    "ModelRegistry",
    "ModelRouter",
    "ModelSpec",
    "NoCapableModel",
    "RoutingDecision",
    "Task",
    "TaskClass",
]
