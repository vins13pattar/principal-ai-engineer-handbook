from __future__ import annotations

from .errors import ScopeDeniedError
from .models import CallerIdentity

WILDCARD_SCOPE = "tool:*"


def scope_for(tool_name: str) -> str:
    return f"tool:{tool_name}"


class ScopePolicy:
    """Enforces that a caller may only invoke tools it was explicitly granted.

    A caller's scope set should be the narrowest set a task requires, not
    the agent's full potential reach. Wildcard scopes exist for
    trusted internal callers and should not be handed to arbitrary agents.
    """

    def check(self, identity: CallerIdentity, tool_name: str) -> None:
        if WILDCARD_SCOPE in identity.scopes:
            return
        if scope_for(tool_name) in identity.scopes:
            return
        raise ScopeDeniedError(identity.agent_id, tool_name)
