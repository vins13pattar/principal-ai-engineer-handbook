from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from checkpoint_cost.graphs import build_approval_graph, build_non_associative_delta


def test_interrupt_and_resume_are_one_mechanism() -> None:
    """Module 7's central claim, which nothing in this repo proved before now.

    The run pauses for a human and is resumed from its checkpoint. The same
    resumption path serves a crash, because to the graph they are the same
    event: state exists, execution does not.

    Two arms prove that, not one:

    - Human approval: the *original* compiled graph object resumes via
      ``Command(resume=True)``.
    - Crash recovery: a *second*, independent graph object -- compiled fresh
      against the same saver, sharing nothing in-process with the first --
      recovers the finished state through ``get_state`` alone. No ``Command``
      and no ``interrupt()`` call are involved on this second path (its node
      functions are never executed; ``get_state`` only reads the persisted
      checkpoint). This is the same idiom
      ``test_a_non_associative_reducer_reconstructs_different_state`` and
      ``resume.py`` use for "a second process picks this up from the
      checkpoint alone."

    If crash recovery and human-approval resumption were genuinely different
    mechanisms, the fresh object would have no way to reach the resumed
    values -- it never saw the interrupt and never received a Command. It
    reaches them anyway, because the checkpointer never distinguished "paused
    for a human" from "paused because the process died": both are just
    state without a running task.
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
