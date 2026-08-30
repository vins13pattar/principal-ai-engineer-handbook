"""Three graphs that differ in exactly one dimension: how state accumulates.

No model is called. Each node appends a fixed-size payload, so state size is a
function of step count and nothing else -- which is what makes the cost curve
reproducible.

Deliberately no ``from __future__ import annotations`` here: ``build_delta``
defines ``DeltaState`` as a class local to the function, with an annotation
that closes over the ``snapshot_frequency`` parameter. Postponed evaluation
turns that annotation into a string, and LangGraph resolves it later via
``typing.get_type_hints(schema, include_extras=True)`` with only the module's
globals in scope -- the enclosing function's locals are gone by then, so the
closed-over name is unresolvable (``NameError: name 'snapshot_frequency' is
not defined``). Keeping annotations eager sidesteps that entirely.
"""

import operator
from collections.abc import Sequence
from typing import Annotated, Any, TypedDict

from langgraph.channels import DeltaChannel
from langgraph.graph import END, START, StateGraph


class AccumulatingState(TypedDict):
    items: Annotated[list[str], operator.add]
    remaining: int


class ReplacingState(TypedDict):
    items: list[str]
    remaining: int


def _payload(payload_bytes: int) -> str:
    return "x" * payload_bytes


def _step(payload_bytes: int) -> Any:
    # Returning a plain nested function (rather than an explicit
    # Callable[[Any], dict[str, Any]] annotation) is deliberate: mypy special-cases
    # function literals passed to StateGraph.add_node's overloaded, protocol-bound
    # signature, but an explicit Callable[...] alias does not structurally match
    # those protocols and mypy --strict rejects it as call-overload.
    def node(state: Any) -> dict[str, Any]:
        return {"items": [_payload(payload_bytes)], "remaining": state["remaining"] - 1}

    return node


def _should_continue(state: Any) -> str:
    return "work" if state["remaining"] > 0 else END


def _wire(graph: StateGraph[Any, Any, Any, Any], payload_bytes: int) -> StateGraph[Any, Any, Any, Any]:
    graph.add_node("work", _step(payload_bytes))
    graph.add_edge(START, "work")
    graph.add_conditional_edges("work", _should_continue, {"work": "work", END: END})
    return graph


def build_accumulating(payload_bytes: int) -> StateGraph[Any, Any, Any, Any]:
    """State grows every step. The shape the Reference lookup warns about."""
    return _wire(StateGraph(AccumulatingState), payload_bytes)


def build_non_accumulating(payload_bytes: int) -> StateGraph[Any, Any, Any, Any]:
    """The control. State is replaced each step and stays one item."""

    graph: StateGraph[Any, Any, Any, Any] = StateGraph(ReplacingState)
    graph.add_node("work", _step(payload_bytes))
    graph.add_edge(START, "work")
    graph.add_conditional_edges("work", _should_continue, {"work": "work", END: END})
    return graph


def _append(state: list[str] | None, writes: Sequence[Any]) -> list[str]:
    """Batching-invariant by construction: concatenation is associative."""
    current = list(state or [])
    for write in writes:
        current.extend(write)
    return current


def build_delta(payload_bytes: int, snapshot_frequency: int) -> StateGraph[Any, Any, Any, Any]:
    """The same growth, through the channel the lookup recommends."""

    class DeltaState(TypedDict):
        items: Annotated[
            list[str], DeltaChannel(_append, list, snapshot_frequency=snapshot_frequency)
        ]
        remaining: int

    return _wire(StateGraph(DeltaState), payload_bytes)
