# Secure Runtime Configuration

Run the JWT-, Redis-, and policy-aware application:

```bash
export JWT_SECRET='replace-me'
export REDIS_URL='redis://localhost:6379/0'
export OTEL_EXPORTER_OTLP_ENDPOINT='http://localhost:4318'
export QUOTA_CAPACITY='60'
export QUOTA_REFILL_PER_SECOND='10'
uvicorn ai_gateway.secure_app:app --reload
```

Create a development token:

```python
import jwt

print(jwt.encode(
    {"sub": "user-1", "tenant_id": "tenant-a", "tier": "pro"},
    "replace-me",
    algorithm="HS256",
))
```

Call the gateway:

```bash
curl http://127.0.0.1:8000/v1/generate \
  -H 'authorization: Bearer <TOKEN>' \
  -H 'content-type: application/json' \
  -d '{"prompt":"Explain admission control","provider":"secondary"}'
```

## Runtime behaviour

1. The bearer token is verified before tenant identity is accepted.
2. `tenant_id`, `sub`, and `tier` come from signed claims.
3. Redis is used for atomic cross-replica quota enforcement when configured.
4. The sample falls back to a process-local tenant limiter if Redis is unavailable. Production systems should make fail-open, fail-closed, or emergency-budget behaviour explicit.
5. Tenant tier controls provider access and maximum request timeout.
6. OTLP trace export is enabled only when an endpoint is configured.

## Production hardening

- Prefer asymmetric JWT validation with issuer, audience, expiry, and key rotation through JWKS.
- Never use the included development JWT secret in production.
- Do not silently downgrade to local quotas for billing or strict abuse controls.
- Keep provider policy in a versioned policy service or configuration store when rules change frequently.
- Include model, region, data residency, cost budget, and safety requirements in routing policy.
- Emit audit events for policy denials and privileged provider selection.
- Add Redis TLS, authentication, timeouts, circuit breaking, and explicit degraded-mode behaviour.
- Flush OpenTelemetry processors during graceful shutdown.
