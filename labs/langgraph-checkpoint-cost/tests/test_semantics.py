from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from checkpoint_cost.graphs import build_approval_graph, build_non_associative_delta


def test_approval_resumes_and_finished_state_survives_a_fresh_graph() -> None:
    """Two narrow facts about Module 7's claim -- deliberately not the claim itself.

    Arm one: the approval path pauses at ``interrupt()`` and the *original*
    compiled graph object resumes it to completion via ``Command(resume=True)``.

    Arm two: a *second*, independent graph object -- compiled fresh against the
    same saver, sharing nothing in-process with the first -- reads the
    *finished* values back through ``get_state`` alone. No ``Command``, no
    ``interrupt()``, and its node functions are never executed; ``get_state``
    only reads the persisted checkpoint. Same idiom as
    ``test_a_non_associative_reducer_reconstructs_different_state`` and
    ``resume.py``: "a second process picks this up from the checkpoint alone."

    **What this does NOT prove**, and an earlier version of this docstring
    claimed that it did: that a still-*pending* interrupted checkpoint can be
    driven to completion by a fresh process with no ``Command``. Arm two reads
    finished state; it does not resume a pending run. That is a narrower
    result than "human-in-the-loop and crash recovery are one mechanism", and
    the narrower result is the one these assertions support. The Build page
    stops in the same place, on purpose.
    """
    saver = InMemorySaver()
    graph = build_approval_graph().compile(checkpointer=saver)
    config: RunnableConfig = {"configurable": {"thread_id": "approval"}}

    first: dict[str, Any] = graph.invoke({"approved": False, "log": []}, config)
    assert "__interrupt__" in first

    resumed: dict[str, Any] = graph.invoke(Command(resume=True), config)
    assert resumed["approved"] is True
    assert resumed["log"] == ["requested", "granted"]

    # Crash-recovery arm: fresh compile, same saver, no Command, no interrupt().
    crash_reader = build_approval_graph().compile(checkpointer=saver)
    recovered = crash_reader.get_state(config).values
    assert recovered["approved"] is True
    assert recovered["log"] == ["requested", "granted"]
    assert recovered == resumed


def test_a_non_associative_reducer_reconstructs_different_state() -> None:
    """DeltaChannel requires a batching-invariant reducer and cannot check it.

    Replay folds writes in larger batches than they were produced in, so a
    reducer that is sensitive to batching returns something else after a
    resume -- with no error raised anywhere.
    """
    saver = InMemorySaver()
    graph = build_non_associative_delta(payload_bytes=8).compile(checkpointer=saver)
    config: RunnableConfig = {"configurable": {"thread_id": "assoc"}}

    live: dict[str, Any] = graph.invoke({"items": [], "remaining": 12}, config)

    reader = build_non_associative_delta(payload_bytes=8).compile(checkpointer=saver)
    reconstructed = reader.get_state(config).values

    assert reconstructed["items"] != live["items"]

    # The exact counts, not just their inequality. The Build page publishes
    # "25 items live, 13 after replay" as a measured number; pinning only the
    # inequality would let a LangGraph change move those figures without
    # failing anything, and the published number would quietly go stale.
    assert len(live["items"]) == 25
    assert len(reconstructed["items"]) == 13
