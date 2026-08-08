from __future__ import annotations

from typing import Any

import jsonschema

from .errors import ArgumentValidationError, DuplicateToolError, ToolNotFoundError
from .models import ToolHandler, ToolSpec


class ToolRegistry:
    """The source of truth for what tools exist and how to call them.

    Keeping this separate from the gateway means an agent's available
    tools come from a lookup, not a hardcoded list embedded in a prompt.
    """

    def __init__(self) -> None:
        self._specs: dict[str, ToolSpec] = {}
        self._handlers: dict[str, ToolHandler] = {}

    def register(self, spec: ToolSpec, handler: ToolHandler) -> None:
        if spec.name in self._specs:
            raise DuplicateToolError(spec.name)
        self._specs[spec.name] = spec
        self._handlers[spec.name] = handler

    def get(self, tool_name: str) -> ToolSpec:
        spec = self._specs.get(tool_name)
        if spec is None:
            raise ToolNotFoundError(tool_name)
        return spec

    def handler_for(self, tool_name: str) -> ToolHandler:
        handler = self._handlers.get(tool_name)
        if handler is None:
            raise ToolNotFoundError(tool_name)
        return handler

    def list(self) -> list[ToolSpec]:
        return list(self._specs.values())


def validate_arguments(spec: ToolSpec, arguments: dict[str, Any]) -> None:
    """Validate call arguments against a tool's declared JSON Schema.

    Tool arguments are attacker-controlled: they may come from a model's
    generation, not from a trusted client. Rejecting malformed input before
    it reaches a handler is the same discipline as validating any other
    untrusted request body.
    """
    try:
        jsonschema.validate(arguments, spec.input_schema)
    except jsonschema.ValidationError as exc:
        raise ArgumentValidationError(spec.name, exc.message) from exc
