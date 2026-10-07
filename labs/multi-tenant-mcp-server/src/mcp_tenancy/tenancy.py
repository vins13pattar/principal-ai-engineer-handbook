from __future__ import annotations

from dataclasses import dataclass, field


class TenancyError(Exception):
    pass


class UnknownTenantError(TenancyError):
    def __init__(self, tenant_id: str) -> None:
        super().__init__(f"unknown tenant: {tenant_id!r}")
        self.tenant_id = tenant_id


@dataclass(frozen=True, slots=True)
class Tenant:
    """A caller identity and the capabilities granted to it."""

    tenant_id: str
    tools: frozenset[str] = field(default_factory=frozenset)
    resources: frozenset[str] = field(default_factory=frozenset)

    def grants_tool(self, name: str) -> bool:
        return name in self.tools

    def grants_resource(self, uri: str) -> bool:
        return uri in self.resources


class TenantRegistry:
    """Maps bearer tokens to tenants, and tenant ids back to their grants.

    A stand-in for a real identity provider. Under the 2026-07-28 authorization
    model a production server verifies a token minted by an authorization
    server, validates the issuer per RFC 9207, and binds the credential to that
    issuer. Only `verify` changes when that happens — everything downstream
    works from the resolved `Tenant`.

    Each token also records the resource it was issued for -- its RFC 8707
    resource indicator, the audience a real token carries. A token is valid for
    one server, not for every server that happens to recognise it.
    """

    def __init__(
        self, tokens: dict[str, Tenant] | None = None, *, resource: str | None = None
    ) -> None:
        self._by_token: dict[str, Tenant] = dict(tokens or {})
        self._by_id: dict[str, Tenant] = {t.tenant_id: t for t in self._by_token.values()}
        self._resource_by_token: dict[str, str | None] = {t: resource for t in self._by_token}

    def register(self, token: str, tenant: Tenant, *, resource: str | None = None) -> None:
        self._by_token[token] = tenant
        self._by_id[tenant.tenant_id] = tenant
        self._resource_by_token[token] = resource

    def resource_for(self, token: str) -> str | None:
        """The resource a token was issued for, or None if it is unknown or unbound."""
        return self._resource_by_token.get(token)

    def verify(self, token: str) -> Tenant | None:
        """Returns the tenant for a bearer token, or None if it is not valid."""
        return self._by_token.get(token)

    def get(self, tenant_id: str) -> Tenant:
        try:
            return self._by_id[tenant_id]
        except KeyError:
            raise UnknownTenantError(tenant_id) from None

    def tenants(self) -> list[Tenant]:
        return list(self._by_id.values())
