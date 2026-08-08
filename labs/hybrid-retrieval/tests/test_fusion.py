from __future__ import annotations

from retrieval.fusion import reciprocal_rank_fusion


def test_item_ranked_first_in_both_lists_wins() -> None:
    fused = reciprocal_rank_fusion([["a", "b", "c"], ["a", "c", "b"]])
    assert fused[0][0] == "a"


def test_item_present_in_only_one_list_still_gets_credit() -> None:
    fused = reciprocal_rank_fusion([["a", "b"], ["c"]])
    ids = {chunk_id for chunk_id, _ in fused}
    assert ids == {"a", "b", "c"}


def test_being_ranked_well_in_both_lists_beats_top_of_only_one() -> None:
    fused = reciprocal_rank_fusion([["a", "b", "c"], ["b", "a", "c"]])
    scores = dict(fused)
    assert scores["a"] > scores["c"]
    assert scores["b"] > scores["c"]


def test_empty_rankings_produce_no_results() -> None:
    assert reciprocal_rank_fusion([]) == []
    assert reciprocal_rank_fusion([[], []]) == []
