"""도메인 엔티티: 호스트 시스템 지표 스냅샷 (순수 Python, 프레임워크/psutil import 금지)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass
class CpuMetrics:
    """CPU 사용률(전체 + 코어별)."""

    percent: float
    per_core: list[float]
    cores: int
    model: str | None = None


@dataclass
class MemoryMetrics:
    """물리 메모리(RAM) 사용량."""

    total_bytes: int
    used_bytes: int
    percent: float


@dataclass
class DiskMetrics:
    """디스크(스토리지) 사용량: 대상 경로 기준."""

    total_bytes: int
    used_bytes: int
    percent: float
    path: str


@dataclass
class GpuMetrics:
    """단일 GPU 사용률 + VRAM."""

    index: int
    name: str
    util_percent: float
    mem_total_bytes: int
    mem_used_bytes: int
    mem_percent: float
    temp_c: float | None = None
    power_w: float | None = None


@dataclass
class ProcessUsage:
    """리소스를 점유하는 프로세스 1개(top consumers 리스트업용)."""

    pid: int
    name: str
    percent: float  # cpu: 시스템 전체 대비 % / ram: 전체 RAM 대비 % / gpu, vram: 전체 VRAM 대비 %
    bytes: int | None = None  # ram: RSS / gpu, vram: 사용 VRAM / cpu: None


@dataclass
class HostInfo:
    """이 에이전트가 대표하는 호스트 정체성."""

    id: str
    label: str
    role: str  # web | ai | all


@dataclass
class MetricsSnapshot:
    """한 시점의 호스트 지표 스냅샷(시계열은 소비자가 폴링으로 누적)."""

    host: HostInfo
    timestamp: datetime
    cpu: CpuMetrics
    memory: MemoryMetrics
    disk: DiskMetrics | None
    gpus: list[GpuMetrics]


# 정적 하드웨어 상세(on-demand, 클릭 시 조회)


@dataclass
class CpuHardware:
    model: str | None
    physical_cores: int | None
    logical_cores: int | None
    base_mhz: float | None
    max_mhz: float | None
    arch: str | None


@dataclass
class MemoryModule:
    """물리 메모리 모듈 1개(SMBIOS)."""

    slot: str | None
    size_bytes: int | None
    kind: str | None  # DDR4/DDR5 등
    speed_mhz: int | None
    manufacturer: str | None
    part_number: str | None


@dataclass
class MemoryHardware:
    total_bytes: int
    modules: list[MemoryModule]


@dataclass
class GpuHardware:
    index: int
    name: str
    mem_total_bytes: int
    driver_version: str | None
    vbios: str | None
    temp_c: float | None
    power_w: float | None
    power_limit_w: float | None


@dataclass
class PhysicalDisk:
    """물리 저장장치 1개(SSD/HDD/NVMe)."""

    name: str
    model: str | None
    kind: str  # SSD | HDD | NVMe | unknown
    bus: str | None  # nvme | sata | usb ...
    size_bytes: int | None


@dataclass
class DiskHardware:
    """마운트된 볼륨(논리): 사용량."""

    device: str | None
    mountpoint: str | None
    fstype: str | None
    total_bytes: int
    used_bytes: int
    percent: float


@dataclass
class HardwareInfo:
    cpu: CpuHardware
    memory: MemoryHardware
    gpus: list[GpuHardware]
    physical_disks: list[PhysicalDisk]
    disks: list[DiskHardware]  # 볼륨(마운트) 사용량
