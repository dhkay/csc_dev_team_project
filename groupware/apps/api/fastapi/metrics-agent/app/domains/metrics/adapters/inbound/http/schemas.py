"""Pydantic 응답 스키마: GET /metrics/snapshot 와이어 계약(camelCase).

파이썬 필드는 snake_case, 출력은 alias_generator(to_camel)로 camelCase 직렬화
(FastAPI 기본 response_model_by_alias=True). 애그리게이터(csc-control-tower)가 이 계약을 소비한다.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class HostSchema(_Camel):
    id: str
    label: str
    role: str


class CpuSchema(_Camel):
    percent: float
    per_core: list[float]
    cores: int
    model: str | None = None


class MemorySchema(_Camel):
    total_bytes: int
    used_bytes: int
    percent: float


class DiskSchema(_Camel):
    total_bytes: int
    used_bytes: int
    percent: float
    path: str


class GpuSchema(_Camel):
    index: int
    name: str
    util_percent: float
    mem_total_bytes: int
    mem_used_bytes: int
    mem_percent: float
    temp_c: float | None = None
    power_w: float | None = None


class ProcessUsageSchema(_Camel):
    pid: int
    name: str
    percent: float
    bytes: int | None = None


class CpuHardwareSchema(_Camel):
    model: str | None = None
    physical_cores: int | None = None
    logical_cores: int | None = None
    base_mhz: float | None = None
    max_mhz: float | None = None
    arch: str | None = None


class MemoryModuleSchema(_Camel):
    slot: str | None = None
    size_bytes: int | None = None
    kind: str | None = None
    speed_mhz: int | None = None
    manufacturer: str | None = None
    part_number: str | None = None


class MemoryHardwareSchema(_Camel):
    total_bytes: int
    modules: list[MemoryModuleSchema]


class GpuHardwareSchema(_Camel):
    index: int
    name: str
    mem_total_bytes: int
    driver_version: str | None = None
    vbios: str | None = None
    temp_c: float | None = None
    power_w: float | None = None
    power_limit_w: float | None = None


class PhysicalDiskSchema(_Camel):
    name: str
    model: str | None = None
    kind: str
    bus: str | None = None
    size_bytes: int | None = None


class DiskHardwareSchema(_Camel):
    device: str | None = None
    mountpoint: str | None = None
    fstype: str | None = None
    total_bytes: int
    used_bytes: int
    percent: float


class HardwareResponse(_Camel):
    cpu: CpuHardwareSchema
    memory: MemoryHardwareSchema
    gpus: list[GpuHardwareSchema]
    physical_disks: list[PhysicalDiskSchema]
    disks: list[DiskHardwareSchema]


class SnapshotResponse(_Camel):
    host: HostSchema
    timestamp: datetime
    cpu: CpuSchema
    memory: MemorySchema
    disk: DiskSchema | None = None
    gpus: list[GpuSchema]
