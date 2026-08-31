from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph.state import StateGraph

from checkpoint_cost.graphs import build_accumulating, build_delta, build_non_accumulating


def _run(graph: StateGraph[Any, Any, Any, Any], steps: int) -> dict[str, Any]:
    compiled = graph.compile(checkpointer=InMemorySaver())
    config: RunnableConfig = {"configurable": {"thread_id": "t"}}
    result: dict[str, Any] = compiled.invoke({"items": [], "remaining": steps}, config)
    return result


def test_accumulating_state_grows_with_steps() -> None:
    short = _run(build_accumulating(payload_bytes=64), steps=3)
    long = _run(build_accumulating(payload_bytes=64), steps=9)
    assert len(long["items"]) > len(short["items"])


def test_non_accumulating_state_stays_one_item() -> None:
    result = _run(build_non_accumulating(payload_bytes=64), steps=9)
    assert len(result["items"]) == 1


def test_delta_graph_reaches_the_same_state_as_accumulating() -> None:
    plain = _run(build_accumulating(payload_bytes=64), steps=5)
    delta = _run(build_delta(payload_bytes=64, snapshot_frequency=1000), steps=5)
    assert len(delta["items"]) == len(plain["items"])
