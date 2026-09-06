"""Outbound Adapter: psutil 로 CPU/RAM 읽기.

컨테이너에서 호스트 지표를 얻으려면 psutil.PROCFS_PATH 를 마운트된 호스트 /proc 으로 바꾼다
(compose 에서 /proc:/host/proc:ro + HOST_PROC=/host/proc). 리눅스에서 cpu/메모리 read 에 반영된다.
Windows/로컬 pnpm 에서는 PROCFS_PATH 가 무의미하므로 기본 /proc 이면 건드리지 않는다.
"""

from __future__ import annotations

import os
import platform
import time

import psutil

from ....core.domain.entities import (
    CpuHardware,
    CpuMetrics,
    DiskHardware,
    DiskMetrics,
    MemoryHardware,
    MemoryMetrics,
    PhysicalDisk,
    ProcessUsage,
)
from ..hardware.dmi import read_memory_modules
from ..hardware.disk_info import read_physical_disks
from ..process_label import friendly_label

# 디스크 하드웨어에서 제외할 가상/특수 파일시스템.
_PSEUDO_FS = {
    "proc", "sysfs", "tmpfs", "devtmpfs", "devpts", "cgroup", "cgroup2",
    "overlay", "squashfs", "ramfs", "autofs", "mqueue", "debugfs",
    "tracefs", "securityfs", "pstore", "bpf", "configfs", "fusectl",
    "binfmt_misc", "hugetlbfs",
}


def _read_cpu_model(proc_path: str) -> str | None:
    """정확한 CPU 제품명. 리눅스(prod)=/proc/cpuinfo, Windows(dev)=레지스트리, 그 외 platform 폴백."""
    # 리눅스: /proc/cpuinfo 의 'model name' = 제품명(예: '13th Gen Intel(R) Core(TM) i7-13700K').
    cpuinfo = os.path.join(proc_path, "cpuinfo")
    try:
        with open(cpuinfo, encoding="utf-8") as fh:
            for line in fh:
                if line.lower().startswith("model name"):
                    return line.split(":", 1)[1].strip()
    except OSError:
        pass

    # Windows: platform.processor() 는 'Intel64 Family 6 Model ...'(원시 CPUID) → 레지스트리의 제품명 사용.
    if os.name == "nt":
        try:
            import winreg

            with winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
            ) as key:
                name, _ = winreg.QueryValueEx(key, "ProcessorNameString")
                if name:
                    return str(name).strip()
        except OSError:
            pass

    import platform

    return platform.processor() or None


class PsutilSystemReader:
    """SystemMetricsReaderPort 구현."""

    def __init__(
        self, proc_path: str = "/proc", disk_path: str = "/", sys_path: str = "/sys"
    ) -> None:
        # 리눅스 컨테이너에서 호스트 /proc 보정. 기본값이면 psutil 기본 동작 유지.
        if proc_path and proc_path != "/proc" and hasattr(psutil, "PROCFS_PATH"):
            psutil.PROCFS_PATH = proc_path
        self._proc_path = proc_path
        self._disk_path = disk_path
        self._sys_path = sys_path
        self._model = _read_cpu_model(proc_path)

    def prime(self) -> None:
        # cpu_percent(interval=None) 은 첫 호출이 0.0 → 기동 시 워밍업으로 내부 기준선 세팅.
        psutil.cpu_percent(interval=None)
        psutil.cpu_percent(interval=None, percpu=True)

    def read_cpu(self) -> CpuMetrics:
        per_core = psutil.cpu_percent(interval=None, percpu=True)
        aggregate = psutil.cpu_percent(interval=None)
        return CpuMetrics(
            percent=round(float(aggregate), 1),
            per_core=[round(float(c), 1) for c in per_core],
            cores=len(per_core),
            model=self._model,
        )

    def read_memory(self) -> MemoryMetrics:
        vm = psutil.virtual_memory()
        return MemoryMetrics(
            total_bytes=int(vm.total),
            used_bytes=int(vm.total - vm.available),
            percent=round(float(vm.percent), 1),
        )

    def read_disk(self) -> DiskMetrics | None:
        # 지정 경로 → 실패 시 OS 루트(Windows 는 cwd 드라이브)로 폴백 → 그래도 실패면 None.
        for path in self._disk_candidates():
            try:
                du = psutil.disk_usage(path)
            except OSError:
                continue
            return DiskMetrics(
                total_bytes=int(du.total),
                used_bytes=int(du.used),
                percent=round(float(du.percent), 1),
                path=path,
            )
        return None

    def read_top_cpu(self, limit: int) -> list[ProcessUsage]:
        # cpu_percent 는 2샘플 필요 → 전 프로세스 프라이밍 후 짧게 대기하고 재측정.
        procs = list(psutil.process_iter(["pid", "name"]))
        for p in procs:
            try:
                p.cpu_percent(None)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        time.sleep(0.4)
        ncpu = psutil.cpu_count() or 1
        out: list[ProcessUsage] = []
        for p in procs:
            try:
                # pid 0(리눅스 스케줄러 / Windows 'System Idle Process')은 유휴시간이라 제외.
                if p.pid <= 0:
                    continue
                # 시스템 전체(0~100%) 기준으로 정규화: 게이지의 aggregate cpu% 와 스케일 일치.
                cpu = p.cpu_percent(None) / ncpu
                if cpu <= 0:
                    continue
                out.append(
                    ProcessUsage(
                        pid=p.pid,
                        name=p.info.get("name") or str(p.pid),
                        percent=round(cpu, 1),
                    )
                )
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        out.sort(key=lambda u: u.percent, reverse=True)
        top = out[:limit]
        for u in top:  # AI 서빙 등 친화적 라벨은 top N 에만(cmdline 비용 절감).
            u.name = friendly_label(u.pid, u.name)
        return top

    def read_top_memory(self, limit: int) -> list[ProcessUsage]:
        total = psutil.virtual_memory().total or 1
        out: list[ProcessUsage] = []
        for p in psutil.process_iter(["pid", "name", "memory_info"]):
            try:
                mi = p.info.get("memory_info")
                if mi is None:
                    continue
                rss = int(mi.rss)
                out.append(
                    ProcessUsage(
                        pid=p.pid,
                        name=p.info.get("name") or str(p.pid),
                        percent=round(rss / total * 100, 1),
                        bytes=rss,
                    )
                )
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        out.sort(key=lambda u: u.bytes or 0, reverse=True)
        top = out[:limit]
        for u in top:
            u.name = friendly_label(u.pid, u.name)
        return top

    def read_cpu_hardware(self) -> CpuHardware:
        freq = None
        try:
            freq = psutil.cpu_freq()
        except Exception:
            freq = None
        return CpuHardware(
            model=self._model,
            physical_cores=psutil.cpu_count(logical=False),
            logical_cores=psutil.cpu_count(logical=True),
            base_mhz=round(float(freq.current), 0) if freq else None,
            max_mhz=round(float(freq.max), 0) if freq and freq.max else None,
            arch=platform.machine() or None,
        )

    def read_memory_hardware(self) -> MemoryHardware:
        return MemoryHardware(
            total_bytes=int(psutil.virtual_memory().total),
            modules=read_memory_modules(),
        )

    def read_disk_hardware(self) -> list[DiskHardware]:
        out: list[DiskHardware] = []
        seen: set[str] = set()
        for part in psutil.disk_partitions(all=False):
            if part.fstype in _PSEUDO_FS or not part.fstype:
                continue
            if part.device in seen:
                continue
            seen.add(part.device)
            try:
                du = psutil.disk_usage(part.mountpoint)
            except OSError:
                continue
            out.append(
                DiskHardware(
                    device=part.device,
                    mountpoint=part.mountpoint,
                    fstype=part.fstype,
                    total_bytes=int(du.total),
                    used_bytes=int(du.used),
                    percent=round(float(du.percent), 1),
                )
            )
        return out

    def read_physical_disks(self) -> list[PhysicalDisk]:
        return read_physical_disks(self._sys_path)

    def _disk_candidates(self) -> list[str]:
        candidates = [self._disk_path]
        # Windows 네이티브 실행 대비 폴백(컨테이너 리눅스에선 첫 후보에서 성공).
        candidates.append(os.path.splitdrive(os.getcwd())[0] + os.sep if os.name == "nt" else "/")
        # 중복 제거(순서 유지).
        seen: set[str] = set()
        return [c for c in candidates if c and not (c in seen or seen.add(c))]
