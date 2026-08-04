from __future__ import annotations

import jwt
import pytest
from fastapi import HTTPException

from ai_gateway.auth import JWTAuthenticator
from ai_gateway.policy import enforce_provider_policy


def test_jwt_authenticator_extracts_tenant_identity() -> None:
    token = jwt.encode(
        {"sub": "user-1", "tenant_id": "tenant-a", "tier": "pro"},
        "secret",
        algorithm="HS256",
    )
    identity = JWTAuthenticator(secret="secret").decode(token)
    assert identity.tenant_id == "tenant-a"
    assert identity.tier == "pro"


def test_standard_tenant_cannot_select_secondary_provider() -> None:
    token = jwt.encode(
        {"sub": "user-1", "tenant_id": "tenant-a", "tier": "standard"},
        "secret",
        algorithm="HS256",
    )
    identity = JWTAuthenticator(secret="secret").decode(token)
    with pytest.raises(HTTPException) as exc_info:
        enforce_provider_policy(identity, "secondary", 10.0)
    assert exc_info.value.status_code == 403
