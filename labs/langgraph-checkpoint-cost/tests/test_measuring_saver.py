from langgraph.checkpoint.memory import InMemorySaver

from checkpoint_cost.measuring_saver import MeasuringSaver


def test_records_one_cost_entry_per_put() -> None:
    saver = MeasuringSaver(InMemorySaver())
    config = {"configurable": {"thread_id": "t1", "checkpoint_ns": ""}}
    checkpoint = {"v": 1, "id": "c1", "ts": "2026-01-01T00:00:00+00:00", "channel_values": {"x": 1}}

    saver.put(config, checkpoint, {}, {})

    assert len(saver.costs) == 1
    assert saver.costs[0].bytes_serialized > 0
    assert saver.costs[0].step == 0


def test_larger_state_serializes_to_more_bytes() -> None:
    saver = MeasuringSaver(InMemorySaver())
    config = {"configurable": {"thread_id": "t1", "checkpoint_ns": ""}}
    small = {"v": 1, "id": "a", "ts": "t", "channel_values": {"x": [0] * 10}}
    large = {"v": 1, "id": "b", "ts": "t", "channel_values": {"x": [0] * 1000}}

    saver.put(config, small, {}, {})
    saver.put(config, large, {}, {})

    assert saver.costs[1].bytes_serialized > saver.costs[0].bytes_serialized
