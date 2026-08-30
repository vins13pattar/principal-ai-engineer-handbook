import asyncio

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

    saver.put(config, small, {}, {"x": "1"})
    saver.put(config, large, {}, {"x": "1"})

    assert saver.costs[1].bytes_serialized > saver.costs[0].bytes_serialized


def test_only_changed_channel_bytes_are_counted() -> None:
    """Two channels; only one changes on the second put.

    A whole-checkpoint approach would count both channels every time, since
    both still sit in ``channel_values``. The real saver -- and this
    instrument -- only re-serializes the channel named in ``new_versions``,
    so the second put's byte count should be much smaller than the first,
    not roughly the same.
    """
    saver = MeasuringSaver(InMemorySaver())
    config = {"configurable": {"thread_id": "t1", "checkpoint_ns": ""}}

    checkpoint_1 = {
        "v": 1,
        "id": "a",
        "ts": "t",
        "channel_values": {"small": 1, "large": [0] * 5000},
    }
    saver.put(config, checkpoint_1, {}, {"small": "1", "large": "1"})

    checkpoint_2 = {
        "v": 1,
        "id": "b",
        "ts": "t",
        "channel_values": {"small": 2, "large": [0] * 5000},
    }
    saver.put(config, checkpoint_2, {}, {"small": "2"})

    assert saver.costs[1].bytes_serialized < saver.costs[0].bytes_serialized / 2


def test_async_put_and_get_tuple_delegate_without_notimplementederror() -> None:
    """MeasuringSaver must work under ainvoke/astream, not just invoke/stream.

    BaseCheckpointSaver's aput/aput_writes/aget_tuple/alist all raise
    NotImplementedError by default; without overriding them, wrapping an
    async-capable saver like InMemorySaver breaks it.
    """
    saver = MeasuringSaver(InMemorySaver())
    config = {"configurable": {"thread_id": "t1", "checkpoint_ns": ""}}
    checkpoint = {
        "v": 1,
        "id": "c1",
        "ts": "t",
        "channel_values": {"x": 1},
        "channel_versions": {"x": "1"},
    }

    async def run() -> None:
        put_config = await saver.aput(config, checkpoint, {}, {"x": "1"})
        await saver.aput_writes(put_config, [("x", 1)], "task-1")
        tuple_result = await saver.aget_tuple(put_config)
        assert tuple_result is not None

        items = [item async for item in saver.alist(config)]
        assert len(items) == 1

    asyncio.run(run())

    assert len(saver.costs) == 1
    assert saver.costs[0].bytes_serialized > 0
