from __future__ import annotations

import asyncio
from typing import Any

from .models import RiskLevel, ToolSpec
from .registry import ToolRegistry

SEARCH_KNOWLEDGE_BASE_SCHEMA = {
    "type": "object",
    "properties": {"query": {"type": "string", "minLength": 1, "maxLength": 500}},
    "required": ["query"],
    "additionalProperties": False,
}

ISSUE_REFUND_SCHEMA = {
    "type": "object",
    "properties": {
        "order_id": {"type": "string", "minLength": 1},
        "amount_usd": {"type": "number", "exclusiveMinimum": 0, "maximum": 10_000},
    },
    "required": ["order_id", "amount_usd"],
    "additionalProperties": False,
}


async def search_knowledge_base(arguments: dict[str, Any]) -> Any:
    await asyncio.sleep(0)
    query = arguments["query"]
    return {"results": [f"doc about {query!r} (#{i})" for i in range(1, 3)]}


async def issue_refund(arguments: dict[str, Any]) -> Any:
    await asyncio.sleep(0)
    return {
        "status": "refunded",
        "order_id": arguments["order_id"],
        "amount_usd": arguments["amount_usd"],
    }


def build_demo_registry() -> ToolRegistry:
    """A read-only tool and a money-moving tool, illustrating the risk split."""
    registry = ToolRegistry()
    registry.register(
        ToolSpec(
            name="search_knowledge_base",
            description="Search internal documentation for an answer.",
            input_schema=SEARCH_KNOWLEDGE_BASE_SCHEMA,
            risk=RiskLevel.LOW,
            rate_limit_per_minute=120,
        ),
        search_knowledge_base,
    )
    registry.register(
        ToolSpec(
            name="issue_refund",
            description="Issue a refund to a customer's original payment method.",
            input_schema=ISSUE_REFUND_SCHEMA,
            risk=RiskLevel.HIGH,
            rate_limit_per_minute=10,
        ),
        issue_refund,
    )
    return registry
