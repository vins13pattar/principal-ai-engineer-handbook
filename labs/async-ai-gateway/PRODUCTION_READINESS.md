# Production Readiness Checklist

Use this checklist before treating the lab as a production service.

## Correctness and contracts

- [ ] Provider adapters have contract tests against supported endpoints.
- [ ] Streaming and non-streaming schemas are versioned.
- [ ] Retryable and non-retryable failures are explicitly classified.
- [ ] Side-effecting operations have idempotency semantics.

## Reliability

- [ ] Global, tenant, provider, and model concurrency limits are defined.
- [ ] Queue wait, connect, read, total request, and drain deadlines are configured.
- [ ] Retries use capped backoff, jitter, and a request-scoped retry budget.
- [ ] Circuit breakers and health ejection are scoped correctly.
- [ ] Readiness fails before shutdown and traffic is drained within a fixed deadline.
- [ ] Redis failure behaviour is explicitly fail-open, fail-closed, or emergency-budget.

## Observability

- [ ] Metrics include request rate, errors, saturation, queue wait, provider latency, retries, time to first token, stream duration, and disconnects.
- [ ] Traces include inbound requests, quota decisions, routing, retries, and outbound provider calls.
- [ ] Structured logs contain request and trace correlation without prompt or secret leakage.
- [ ] Metric labels have bounded cardinality.
- [ ] SLOs and alert thresholds are documented.

## Security and tenancy

- [ ] Tenant identity comes from verified JWT, mTLS, or a trusted gateway.
- [ ] Authorization is evaluated separately from authentication.
- [ ] Provider and model policy is enforced per tenant tier and region.
- [ ] Secrets are stored outside manifests and rotated.
- [ ] Prompt, response, and tool data retention is documented.
- [ ] Abuse controls cover rate, spend, payload size, and suspicious automation.

## Capacity and cost

- [ ] Load tests include steady state, burst, overload, dependency slowdown, and provider outage scenarios.
- [ ] Capacity targets are based on p95 and p99 latency, not averages.
- [ ] Streaming traffic is measured separately because it holds capacity longer.
- [ ] Per-request token and provider cost is observable.
- [ ] Autoscaling signals reflect saturation or queue pressure, not CPU alone.

## Delivery and operations

- [ ] CI runs formatting, linting, typing, tests, dependency scanning, and container scanning.
- [ ] Deployment uses rolling or canary rollout with automatic rollback criteria.
- [ ] Pod disruption budgets and topology spread are configured.
- [ ] Runbooks cover provider outage, Redis outage, quota incidents, overload, and rollback.
- [ ] Ownership, on-call escalation, and post-incident review expectations are clear.
