from __future__ import annotations

from contextlib import AbstractContextManager, nullcontext
from typing import Any

try:
    from opentelemetry import trace
    from opentelemetry.trace import Span
except ImportError:  # Optional dependency for the lab.
    trace = None
    Span = Any  # type: ignore[misc,assignment]


class Tracing:
    def __init__(self, instrumentation_name: str = "ai_gateway") -> None:
        self._tracer = trace.get_tracer(instrumentation_name) if trace is not None else None

    def span(self, name: str, **attributes: str | int | float | bool) -> AbstractContextManager[Any]:
        if self._tracer is None:
            return nullcontext()
        return self._tracer.start_as_current_span(name, attributes=attributes)

    @staticmethod
    def set_error(span: Span, error: BaseException) -> None:
        if trace is None:
            return
        span.record_exception(error)
        span.set_status(trace.Status(trace.StatusCode.ERROR, str(error)))
