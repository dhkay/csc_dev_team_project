"""도메인 엔티티 → 응답 스키마 변환."""

from __future__ import annotations

from ....core.domain.entities import HardwareInfo, MetricsSnapshot, ProcessUsage
from .schemas import (
    CpuHardwareSchema,
    CpuSchema,
    DiskHardwareSchema,
    DiskSchema,
    GpuHardwareSchema,
    GpuSchema,
    HardwareResponse,
    HostSchema,
    MemoryHardwareSchema,
    MemoryModuleSchema,
    MemorySchema,
    PhysicalDiskSchema,
    ProcessUsageSchema,
    SnapshotResponse,
)


def to_process(u: ProcessUsage) -> ProcessUsageSchema:
    return ProcessUsageSchema(pid=u.pid, name=u.name, percent=u.percent, bytes=u.bytes)


def to_hardware(hw: HardwareInfo) -> HardwareResponse:
    return HardwareResponse(
        cpu=CpuHardwareSchema(
            model=hw.cpu.model,
            physical_cores=hw.cpu.physical_cores,
            logical_cores=hw.cpu.logical_cores,
            base_mhz=hw.cpu.base_mhz,
            max_mhz=hw.cpu.max_mhz,
            arch=hw.cpu.arch,
        ),
        memory=MemoryHardwareSchema(
            total_bytes=hw.memory.total_bytes,
            modules=[
                MemoryModuleSchema(
                    slot=m.slot,
                    size_bytes=m.size_bytes,
                    kind=m.kind,
                    speed_mhz=m.speed_mhz,
                    manufacturer=m.manufacturer,
                    part_number=m.part_number,
                )
                for m in hw.memory.modules
            ],
        ),
        gpus=[
            GpuHardwareSchema(
                index=g.index,
                name=g.name,
                mem_total_bytes=g.mem_total_bytes,
                driver_version=g.driver_version,
                vbios=g.vbios,
                temp_c=g.temp_c,
                power_w=g.power_w,
                power_limit_w=g.power_limit_w,
            )
            for g in hw.gpus
        ],
        physical_disks=[
            PhysicalDiskSchema(
                name=p.name,
                model=p.model,
                kind=p.kind,
                bus=p.bus,
                size_bytes=p.size_bytes,
            )
            for p in hw.physical_disks
        ],
        disks=[
            DiskHardwareSchema(
                device=d.device,
                mountpoint=d.mountpoint,
                fstype=d.fstype,
                total_bytes=d.total_bytes,
                used_bytes=d.used_bytes,
                percent=d.percent,
            )
            for d in hw.disks
        ],
    )


def to_response(snap: MetricsSnapshot) -> SnapshotResponse:
    return SnapshotResponse(
        host=HostSchema(id=snap.host.id, label=snap.host.label, role=snap.host.role),
        timestamp=snap.timestamp,
        cpu=CpuSchema(
            percent=snap.cpu.percent,
            per_core=snap.cpu.per_core,
            cores=snap.cpu.cores,
            model=snap.cpu.model,
        ),
        memory=MemorySchema(
            total_bytes=snap.memory.total_bytes,
            used_bytes=snap.memory.used_bytes,
            percent=snap.memory.percent,
        ),
        disk=(
            DiskSchema(
                total_bytes=snap.disk.total_bytes,
                used_bytes=snap.disk.used_bytes,
                percent=snap.disk.percent,
                path=snap.disk.path,
            )
            if snap.disk is not None
            else None
        ),
        gpus=[
            GpuSchema(
                index=g.index,
                name=g.name,
                util_percent=g.util_percent,
                mem_total_bytes=g.mem_total_bytes,
                mem_used_bytes=g.mem_used_bytes,
                mem_percent=g.mem_percent,
                temp_c=g.temp_c,
                power_w=g.power_w,
            )
            for g in snap.gpus
        ],
    )
