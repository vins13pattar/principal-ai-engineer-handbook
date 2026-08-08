from __future__ import annotations

import pytest

from tool_gateway.errors import ArgumentValidationError, DuplicateToolError, ToolNotFoundError
from tool_gateway.models import ToolSpec
from tool_gateway.registry import ToolRegistry, validate_arguments

SCHEMA = {
    "type": "object",
    "properties": {"query": {"type": "string"}},
    "required": ["query"],
    "additionalProperties": False,
}


def make_spec(name: str = "search") -> ToolSpec:
    return ToolSpec(name=name, description="search", input_schema=SCHEMA)


async def handler(_: dict) -> str:
    return "ok"


def test_register_and_get() -> None:
    registry = ToolRegistry()
    spec = make_spec()
    registry.register(spec, handler)

    assert registry.get("search") is spec
    assert registry.handler_for("search") is handler
    assert registry.list() == [spec]


def test_duplicate_registration_rejected() -> None:
    registry = ToolRegistry()
    registry.register(make_spec(), handler)

    with pytest.raises(DuplicateToolError):
        registry.register(make_spec(), handler)


def test_unknown_tool_raises() -> None:
    registry = ToolRegistry()

    with pytest.raises(ToolNotFoundError):
        registry.get("missing")
    with pytest.raises(ToolNotFoundError):
        registry.handler_for("missing")


def test_validate_arguments_accepts_valid_payload() -> None:
    validate_arguments(make_spec(), {"query": "hello"})


def test_validate_arguments_rejects_missing_field() -> None:
    with pytest.raises(ArgumentValidationError):
        validate_arguments(make_spec(), {})


def test_validate_arguments_rejects_wrong_type() -> None:
    with pytest.raises(ArgumentValidationError):
        validate_arguments(make_spec(), {"query": 123})


def test_validate_arguments_rejects_unknown_field() -> None:
    with pytest.raises(ArgumentValidationError):
        validate_arguments(make_spec(), {"query": "hello", "extra": "nope"})
