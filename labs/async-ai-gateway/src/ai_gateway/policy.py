from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException

from .auth import Identity


@dataclass(frozen=True, slots=True)
class TenantPolicy:
    allowed_providers: frozenset[str]
    max_timeout_seconds: float


POLICIES: dict[str, TenantPolicy] = {
    "standard": TenantPolicy(frozenset({"primary"}), 20.0),
    "pro": TenantPolicy(frozenset({"primary", "secondary"}), 60.0),
    "enterprise": TenantPolicy(frozenset({"primary", "secondary"}), 120.0),
}


def enforce_provider_policy(
    identity: Identity, provider: str | None, timeout_seconds: float
) -> None:
    policy = POLICIES.get(identity.tier, POLICIES["standard"])
    if provider is not None and provider not in policy.allowed_providers:
        raise HTTPException(status_code=403, detail="Provider is not allowed for this tenant tier")
    if timeout_seconds > policy.max_timeout_seconds:
        raise HTTPException(status_code=403, detail="Requested timeout exceeds tenant policy")
