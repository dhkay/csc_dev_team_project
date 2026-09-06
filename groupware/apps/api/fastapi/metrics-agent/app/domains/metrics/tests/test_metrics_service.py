"""MetricsService 단위 테스트: 가짜 리더 주입(프레임워크/하드웨어 불필요)."""

from __future__ import annotations

from app.domains.metrics.core.application.services import MetricsService
from app.domains.metrics.core.domain.entities import (
    CpuHardware,
    CpuMetrics,
    DiskHardware,
    DiskMetrics,
    GpuHardware,
    GpuMetrics,
    HostInfo,
    MemoryHardware,
    MemoryMetrics,
    MemoryModule,
    PhysicalDisk,
    ProcessUsage,
)

HOST = HostInfo(id="test", label="Test", role="all")


class FakeSystemReader:
    def __init__(self) -> None:
        self.primed = False

    def prime(self) -> None:
        self.primed = True

    def read_cpu(self) -> CpuMetrics:
        return CpuMetrics(percent=12.5, per_core=[10.0, 15.0], cores=2, model="Fake CPU")

    def read_memory(self) -> MemoryMetrics:
        return MemoryMetrics(total_bytes=1000, used_bytes=400, percent=40.0)

    def read_disk(self) -> DiskMetrics | None:
        return DiskMetrics(total_bytes=5000, used_bytes=2500, percent=50.0, path="/")

    def read_top_cpu(self, limit: int) -> list[ProcessUsage]:
        return [ProcessUsage(pid=1, name="cpu-hog", percent=42.0)][:limit]

    def read_top_memory(self, limit: int) -> list[ProcessUsage]:
        return [ProcessUsage(pid=2, name="mem-hog", percent=10.0, bytes=999)][:limit]

    def read_cpu_hardware(self) -> CpuHardware:
        return CpuHardware(
            model="Fake CPU",
            physical_cores=4,
            logical_cores=8,
            base_mhz=3000.0,
            max_mhz=5000.0,
            arch="x86_64",
        )

    def read_memory_hardware(self) -> MemoryHardware:
        return MemoryHardware(
            total_bytes=1000,
            modules=[
                MemoryModule(
                    slot="DIMM0",
                    size_bytes=500,
                    kind="DDR5",
                    speed_mhz=5600,
                    manufacturer="ACME",
                    part_number="X",
                )
            ],
        )

    def read_disk_hardware(self) -> list[DiskHardware]:
        return [
            DiskHardware(
                device="/dev/sda1",
                mountpoint="/",
                fstype="ext4",
                total_bytes=5000,
                used_bytes=2500,
                percent=50.0,
            )
        ]

    def read_physical_disks(self) -> list[PhysicalDisk]:
        return [
            PhysicalDisk(
                name="nvme0n1",
                model="Fake NVMe",
                kind="NVMe",
                bus="nvme",
                size_bytes=1_000_000,
            )
        ]


class FakeGpuReader:
    def __init__(self, gpus: list[GpuMetrics] | None = None, boom: bool = False) -> None:
        self._gpus = gpus or []
        self._boom = boom

    def read_gpus(self) -> list[GpuMetrics]:
        if self._boom:
            raise RuntimeError("NVML down")
        return self._gpus

    def read_top_gpu(self, limit: int) -> list[ProcessUsage]:
        return [ProcessUsage(pid=3, name="gpu-hog", percent=70.0, bytes=2048)][:limit]

    def read_gpu_hardware(self) -> list[GpuHardware]:
        if self._boom:
            raise RuntimeError("NVML down")
        return [
            GpuHardware(
                index=0,
                name="Fake GPU",
                mem_total_bytes=8192,
                driver_version="999.0",
                vbios="1.0",
                temp_c=50.0,
                power_w=100.0,
                power_limit_w=200.0,
            )
        ]


def test_snapshot_assembles_cpu_memory_gpu() -> None:
    gpu = GpuMetrics(
        index=0,
        name="Fake GPU",
        util_percent=88.0,
        mem_total_bytes=2000,
        mem_used_bytes=1000,
        mem_percent=50.0,
    )
    service = MetricsService(FakeSystemReader(), FakeGpuReader([gpu]), HOST)

    snap = service.snapshot()

    assert snap.host.id == "test"
    assert snap.cpu.percent == 12.5
    assert snap.cpu.cores == 2
    assert snap.memory.percent == 40.0
    assert snap.disk is not None and snap.disk.percent == 50.0
    assert len(snap.gpus) == 1
    assert snap.gpus[0].name == "Fake GPU"
    assert snap.timestamp.tzinfo is not None


def test_snapshot_gpu_failure_degrades_to_empty() -> None:
    service = MetricsService(FakeSystemReader(), FakeGpuReader(boom=True), HOST)

    snap = service.snapshot()

    # GPU 리더 예외는 삼켜지고 gpus=[] 로 성공해야 한다(에이전트 크래시 금지).
    assert snap.gpus == []
    assert snap.cpu.percent == 12.5


def test_top_dispatches_by_resource() -> None:
    service = MetricsService(FakeSystemReader(), FakeGpuReader(), HOST)
    assert service.top("cpu", 5)[0].name == "cpu-hog"
    assert service.top("ram", 5)[0].name == "mem-hog"
    assert service.top("gpu", 5)[0].name == "gpu-hog"
    assert service.top("vram", 5)[0].name == "gpu-hog"  # gpu/vram 동일 소스
    assert service.top("bogus", 5) == []  # 알 수 없는 리소스 → 빈 목록


def test_hardware_assembles_sections() -> None:
    service = MetricsService(FakeSystemReader(), FakeGpuReader(), HOST)
    hw = service.hardware()
    assert hw.cpu.model == "Fake CPU"
    assert hw.cpu.physical_cores == 4
    assert hw.memory.modules[0].kind == "DDR5"
    assert hw.gpus[0].driver_version == "999.0"
    assert hw.disks[0].fstype == "ext4"
    assert hw.physical_disks[0].kind == "NVMe"


def test_hardware_gpu_failure_degrades_to_empty() -> None:
    service = MetricsService(FakeSystemReader(), FakeGpuReader(boom=True), HOST)
    hw = service.hardware()
    assert hw.gpus == []
    assert hw.cpu.model == "Fake CPU"  # 나머지 섹션은 정상


def test_prime_delegates_to_system_reader() -> None:
    system = FakeSystemReader()
    service = MetricsService(system, FakeGpuReader(), HOST)

    service.prime()

    assert system.primed is True
