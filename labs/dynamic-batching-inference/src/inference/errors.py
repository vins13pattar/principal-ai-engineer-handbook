from __future__ import annotations


class InferenceServerError(Exception):
    """Base error for the inference server."""


class UnknownVersionError(InferenceServerError):
    def __init__(self, version: str) -> None:
        super().__init__(f"model version {version!r} is not registered")
        self.version = version


class NoServableVersionError(InferenceServerError):
    def __init__(self) -> None:
        super().__init__("no model version currently has nonzero traffic weight")


class BatcherClosedError(InferenceServerError):
    def __init__(self) -> None:
        super().__init__("batcher is shutting down and no longer accepts new requests")
