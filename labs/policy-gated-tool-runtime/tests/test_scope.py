from __future__ import annotations

import pytest

from tool_gateway.errors import ScopeDeniedError
from tool_gateway.models import CallerIdentity
from tool_gateway.scope import ScopePolicy


def identity(scopes: frozenset[str]) -> CallerIdentity:
    return CallerIdentity(agent_id="agent-1", tenant_id="tenant-1", scopes=scopes)


def test_exact_scope_is_allowed() -> None:
    ScopePolicy().check(identity(frozenset({"tool:search_docs"})), "search_docs")


def test_wildcard_scope_allows_any_tool() -> None:
    ScopePolicy().check(identity(frozenset({"tool:*"})), "issue_refund")


def test_missing_scope_is_denied() -> None:
    with pytest.raises(ScopeDeniedError):
        ScopePolicy().check(identity(frozenset({"tool:search_docs"})), "issue_refund")


def test_unrelated_scope_does_not_leak_access() -> None:
    with pytest.raises(ScopeDeniedError):
        ScopePolicy().check(identity(frozenset()), "search_docs")
