"""Outbound Adapter: pynvml(nvidia-ml-py) 로 GPU/VRAM 읽기.

GPU/드라이버가 없거나 NVML init 이 실패하면 조용히 빈 목록을 돌려준다(web 호스트/로컬 개발).
libnvidia-ml 은 NVIDIA 컨테이너 런타임이 호스트 드라이버에서 주입한다. CUDA 툴킷 불필요.
"""

from __future__ import annotations

from ....core.domain.entities import GpuHardware, GpuMetrics, ProcessUsage
from ..process_label import friendly_label

try:
    import psutil  # 프로세스 이름 해석용(선택).
except Exception:  # pragma: no cover
    psutil = None  # type: ignore

# usedGpuMemory 가 N/A 일 때 드라이버가 돌려주는 센티넬(uint64 max).
_NVML_VALUE_NOT_AVAILABLE = 2**64 - 1

try:  # pynvml 는 nvidia-ml-py 배포판이 제공하는 모듈명.
    import pynvml  # type: ignore
except Exception:  # pragma: no cover - 패키지 자체가 없을 때
    pynvml = None  # type: ignore


def _as_str(value) -> str:
    return value.decode() if isinstance(value, bytes) else str(value)


class NvmlGpuReader:
    """GpuMetricsReaderPort 구현. NVML 을 지연 초기화하고 실패는 삼킨다."""

    def __init__(self) -> None:
        self._initialized = False
        self._unavailable = pynvml is None

    def _ensure_init(self) -> bool:
        if self._unavailable:
            return False
        if self._initialized:
            return True
        try:
            pynvml.nvmlInit()
            self._initialized = True
            return True
        except Exception:
            # 드라이버/장치 없음 → 이후 호출도 시도하지 않도록 표시.
            self._unavailable = True
            return False

    def read_gpus(self) -> list[GpuMetrics]:
        if not self._ensure_init():
            return []
        gpus: list[GpuMetrics] = []
        try:
            count = pynvml.nvmlDeviceGetCount()
        except Exception:
            return []
        for index in range(count):
            try:
                handle = pynvml.nvmlDeviceGetHandleByIndex(index)
                name = _as_str(pynvml.nvmlDeviceGetName(handle))
                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
                mem_total = int(mem.total)
                mem_used = int(mem.used)
                mem_percent = round(mem_used / mem_total * 100, 1) if mem_total else 0.0

                temp_c: float | None = None
                try:
                    temp_c = float(
                        pynvml.nvmlDeviceGetTemperature(
                            handle, pynvml.NVML_TEMPERATURE_GPU
                        )
                    )
                except Exception:
                    temp_c = None

                power_w: float | None = None
                try:
                    power_w = round(pynvml.nvmlDeviceGetPowerUsage(handle) / 1000.0, 1)
                except Exception:
                    power_w = None

                gpus.append(
                    GpuMetrics(
                        index=index,
                        name=name,
                        util_percent=round(float(util.gpu), 1),
                        mem_total_bytes=mem_total,
                        mem_used_bytes=mem_used,
                        mem_percent=mem_percent,
                        temp_c=temp_c,
                        power_w=power_w,
                    )
                )
            except Exception:
                # 개별 장치 실패는 건너뛴다(나머지는 계속 보고).
                continue
        return gpus

    def read_top_gpu(self, limit: int) -> list[ProcessUsage]:
        # GPU(VRAM) 점유 프로세스: compute + graphics 러닝 프로세스의 used VRAM 합산.
        if not self._ensure_init():
            return []
        try:
            count = pynvml.nvmlDeviceGetCount()
        except Exception:
            return []
        total_vram = 0
        by_pid: dict[int, int] = {}
        for index in range(count):
            try:
                handle = pynvml.nvmlDeviceGetHandleByIndex(index)
                total_vram += int(pynvml.nvmlDeviceGetMemoryInfo(handle).total)
            except Exception:
                continue
            for fn_name in (
                "nvmlDeviceGetComputeRunningProcesses",
                "nvmlDeviceGetGraphicsRunningProcesses",
            ):
                try:
                    procs = getattr(pynvml, fn_name)(handle)
                except Exception:
                    procs = []
                for pr in procs:
                    used = getattr(pr, "usedGpuMemory", 0) or 0
                    if used == _NVML_VALUE_NOT_AVAILABLE:
                        used = 0
                    by_pid[pr.pid] = by_pid.get(pr.pid, 0) + int(used)

        out: list[ProcessUsage] = []
        for pid, mem in by_pid.items():
            # AI 서빙(vLLM/Ollama)은 cmdline 으로 모델까지 드러낸 라벨, 아니면 프로세스명.
            out.append(
                ProcessUsage(
                    pid=pid,
                    name=friendly_label(pid, _proc_name(pid)),
                    percent=round(mem / total_vram * 100, 1) if total_vram else 0.0,
                    bytes=mem,
                )
            )
        out.sort(key=lambda u: u.bytes or 0, reverse=True)
        return out[:limit]

    def read_gpu_hardware(self) -> list[GpuHardware]:
        if not self._ensure_init():
            return []
        try:
            driver = _as_str(pynvml.nvmlSystemGetDriverVersion())
        except Exception:
            driver = None
        try:
            count = pynvml.nvmlDeviceGetCount()
        except Exception:
            return []
        out: list[GpuHardware] = []
        for index in range(count):
            try:
                handle = pynvml.nvmlDeviceGetHandleByIndex(index)
                mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
                out.append(
                    GpuHardware(
                        index=index,
                        name=_as_str(pynvml.nvmlDeviceGetName(handle)),
                        mem_total_bytes=int(mem.total),
                        driver_version=driver,
                        vbios=_try(lambda: _as_str(pynvml.nvmlDeviceGetVbiosVersion(handle))),
                        temp_c=_try(
                            lambda: float(
                                pynvml.nvmlDeviceGetTemperature(
                                    handle, pynvml.NVML_TEMPERATURE_GPU
                                )
                            )
                        ),
                        power_w=_try(
                            lambda: round(pynvml.nvmlDeviceGetPowerUsage(handle) / 1000.0, 1)
                        ),
                        power_limit_w=_try(
                            lambda: round(
                                pynvml.nvmlDeviceGetEnforcedPowerLimit(handle) / 1000.0, 1
                            )
                        ),
                    )
                )
            except Exception:
                continue
        return out


def _try(fn):
    try:
        return fn()
    except Exception:
        return None


def _proc_name(pid: int) -> str:
    if psutil is not None:
        try:
            return psutil.Process(pid).name()
        except Exception:
            pass
    return f"pid {pid}"
