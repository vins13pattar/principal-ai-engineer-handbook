from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from .models import BenchmarkReport, InferenceResult, ModelVersion, VersionMetrics


class InferRequest(BaseModel):
    payload: Any
    version: str | None = None


class InferResponse(BaseModel):
    version: str
    output: Any
    latency_ms: float

    @classmethod
    def from_result(cls, result: InferenceResult) -> InferResponse:
        return cls(version=result.version, output=result.output, latency_ms=result.latency_ms)


class VersionMetricsResponse(BaseModel):
    request_count: int
    error_count: int
    error_rate: float
    mean_latency_ms: float

    @classmethod
    def from_metrics(cls, metrics: VersionMetrics) -> VersionMetricsResponse:
        return cls(
            request_count=metrics.request_count,
            error_count=metrics.error_count,
            error_rate=metrics.error_rate,
            mean_latency_ms=metrics.mean_latency_ms,
        )


class ModelVersionResponse(BaseModel):
    version: str
    weight: float
    metrics: VersionMetricsResponse

    @classmethod
    def from_version(
        cls, model_version: ModelVersion, metrics: VersionMetrics
    ) -> ModelVersionResponse:
        return cls(
            version=model_version.version,
            weight=model_version.weight,
            metrics=VersionMetricsResponse.from_metrics(metrics),
        )


class BenchmarkRequest(BaseModel):
    num_requests: int = Field(default=100, ge=1, le=5_000)
    concurrency: int = Field(default=10, ge=1, le=500)
    version: str | None = None


class BenchmarkResponse(BaseModel):
    total_requests: int
    error_count: int
    duration_seconds: float
    throughput_rps: float
    p50_latency_ms: float
    p95_latency_ms: float
    p99_latency_ms: float

    @classmethod
    def from_report(cls, report: BenchmarkReport) -> BenchmarkResponse:
        return cls(
            total_requests=report.total_requests,
            error_count=report.error_count,
            duration_seconds=report.duration_seconds,
            throughput_rps=report.throughput_rps,
            p50_latency_ms=report.p50_latency_ms,
            p95_latency_ms=report.p95_latency_ms,
            p99_latency_ms=report.p99_latency_ms,
        )
