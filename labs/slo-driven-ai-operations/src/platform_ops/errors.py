from __future__ import annotations


class PlatformOpsError(Exception):
    pass


class UnknownServiceError(PlatformOpsError):
    def __init__(self, service: str) -> None:
        super().__init__(f"unknown service: {service!r}")
        self.service = service


class UnknownIncidentError(PlatformOpsError):
    def __init__(self, incident_id: str) -> None:
        super().__init__(f"unknown incident: {incident_id!r}")
        self.incident_id = incident_id


class EmptyRunbookError(PlatformOpsError):
    def __init__(self) -> None:
        super().__init__("a runbook needs at least one step")
