from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import Header, HTTPException


@dataclass(frozen=True, slots=True)
class Identity:
    tenant_id: str
    subject: str
    tier: str


class JWTAuthenticator:
    def __init__(self, *, secret: str, algorithm: str = "HS256", audience: str | None = None) -> None:
        self._secret = secret
        self._algorithm = algorithm
        self._audience = audience

    def decode(self, token: str) -> Identity:
        try:
            claims = jwt.decode(
                token,
                self._secret,
                algorithms=[self._algorithm],
                audience=self._audience,
                options={"verify_aud": self._audience is not None},
            )
        except jwt.PyJWTError as exc:
            raise HTTPException(status_code=401, detail="Invalid bearer token") from exc
        tenant_id = str(claims.get("tenant_id", "")).strip()
        subject = str(claims.get("sub", "")).strip()
        if not tenant_id or not subject:
            raise HTTPException(status_code=401, detail="Token is missing tenant identity")
        return Identity(tenant_id=tenant_id, subject=subject, tier=str(claims.get("tier", "standard")))


async def bearer_token(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    return authorization.removeprefix("Bearer ").strip()
