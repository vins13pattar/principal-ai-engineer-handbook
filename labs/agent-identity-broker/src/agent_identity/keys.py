"""Signing material for the lab's simulated authorization server.

DELIBERATELY SIMULATED. A real deployment has an identity provider that owns these
keys, publishes a JWKS endpoint, and rotates them on a schedule. This module
generates an in-memory RSA key per process so the lab runs with no external
dependency — which is part of why this lab is `production-shaped` and not
`production-ready`.

What it does model faithfully: the resource server never holds the private key and
verifies using public material only, exactly as it would against a real JWKS.
"""

from __future__ import annotations

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

ALGORITHM = "RS256"


class SigningKey:
    """An RSA keypair, split into what signs and what verifies."""

    def __init__(self, *, key_id: str = "lab-key-1") -> None:
        self.key_id = key_id
        self._private = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    @property
    def private_pem(self) -> bytes:
        return self._private.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )

    @property
    def public_pem(self) -> bytes:
        """What the resource server verifies with — the only half it should ever see."""
        return self._private.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
