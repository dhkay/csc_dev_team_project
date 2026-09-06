"""Outbound Port(Protocol): 하드웨어 지표 리더 seam.

리더 뒤로 psutil/pynvml 을 격리한다. 향후 다른 소스(AMD/ROCm 등)는 이 Protocol 을 구현하면
서비스 변경 없이 교체된다.
"""

from __future__ import annotations

from typing import Protocol

from ...domain.entities import (
    CpuHardware,
    CpuMetrics,
    DiskHardware,
    DiskMetrics,
    GpuHardware,
    GpuMetrics,
    MemoryHardware,
    MemoryMetrics,
    PhysicalDisk,
    ProcessUsage,
)


class SystemMetricsReaderPort(Protocol):
    """CPU/RAM/디스크 리더."""

    def prime(self) -> None:
        """cpu_percent(interval=None) 의 첫 샘플 0.0 을 피하기 위한 워밍업(기동 시 1회)."""
        ...

    def read_cpu(self) -> CpuMetrics: ...

    def read_memory(self) -> MemoryMetrics: ...

    def read_disk(self) -> DiskMetrics | None:
        """대상 경로의 디스크 사용량. 읽을 수 없으면 None(예외 금지)."""
        ...

    def read_top_cpu(self, limit: int) -> list[ProcessUsage]:
        """CPU 점유 상위 프로세스."""
        ...

    def read_top_memory(self, limit: int) -> list[ProcessUsage]:
        """RAM 점유 상위 프로세스."""
        ...

    def read_cpu_hardware(self) -> CpuHardware: ...

    def read_memory_hardware(self) -> MemoryHardware:
        """물리 메모리 총량 + 모듈(SMBIOS)."""
        ...

    def read_disk_hardware(self) -> list[DiskHardware]:
        """마운트된 볼륨 사용량."""
        ...

    def read_physical_disks(self) -> list[PhysicalDisk]:
        """물리 저장장치(SSD/HDD/NVMe). 미지원 시 빈 목록."""
        ...


class GpuMetricsReaderPort(Protocol):
    """GPU/VRAM 리더. GPU/드라이버 부재 시 빈 목록(예외 금지)."""

    def read_gpus(self) -> list[GpuMetrics]: ...

    def read_top_gpu(self, limit: int) -> list[ProcessUsage]:
        """GPU(VRAM) 점유 상위 프로세스. 미지원/부재 시 빈 목록."""
        ...

    def read_gpu_hardware(self) -> list[GpuHardware]:
        """GPU 상세(드라이버/VBIOS/전력한도 등). 부재 시 빈 목록."""
        ...
