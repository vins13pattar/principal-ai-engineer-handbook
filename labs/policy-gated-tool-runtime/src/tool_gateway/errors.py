from __future__ import annotations


class ToolGatewayError(Exception):
    """Base error for the tool gateway."""


class ToolNotFoundError(ToolGatewayError):
    def __init__(self, tool_name: str) -> None:
        super().__init__(f"tool {tool_name!r} is not registered")
        self.tool_name = tool_name


class DuplicateToolError(ToolGatewayError):
    def __init__(self, tool_name: str) -> None:
        super().__init__(f"tool {tool_name!r} is already registered")
        self.tool_name = tool_name


class ScopeDeniedError(ToolGatewayError):
    def __init__(self, agent_id: str, tool_name: str) -> None:
        super().__init__(f"agent {agent_id!r} has no scope for tool {tool_name!r}")
        self.agent_id = agent_id
        self.tool_name = tool_name


class ArgumentValidationError(ToolGatewayError):
    def __init__(self, tool_name: str, detail: str) -> None:
        super().__init__(f"invalid arguments for tool {tool_name!r}: {detail}")
        self.tool_name = tool_name
        self.detail = detail


class RateLimitExceededError(ToolGatewayError):
    def __init__(self, tool_name: str) -> None:
        super().__init__(f"rate limit exceeded for tool {tool_name!r}")
        self.tool_name = tool_name


class ApprovalDeniedError(ToolGatewayError):
    def __init__(self, tool_name: str, reason: str | None) -> None:
        super().__init__(f"approval denied for tool {tool_name!r}: {reason or 'no reason given'}")
        self.tool_name = tool_name
        self.reason = reason


class ApprovalTimeoutError(ToolGatewayError):
    def __init__(self, tool_name: str) -> None:
        super().__init__(f"approval for tool {tool_name!r} timed out")
        self.tool_name = tool_name


class ApprovalNotFoundError(ToolGatewayError):
    def __init__(self, approval_id: str) -> None:
        super().__init__(f"approval request {approval_id!r} not found")
        self.approval_id = approval_id


class ApprovalAlreadyDecidedError(ToolGatewayError):
    def __init__(self, approval_id: str) -> None:
        super().__init__(f"approval request {approval_id!r} was already decided")
        self.approval_id = approval_id
