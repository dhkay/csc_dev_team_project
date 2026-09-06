"""물리 디스크(SSD/HDD/NVMe) 조회: on-demand.

- Linux(prod): /sys/block/<dev>/queue/rotational(0=SSD,1=HDD) + device/model + size(섹터×512).
  컨테이너는 host /sys 를 마운트(HOST_SYS=/host/sys)해서 호스트 블록 디바이스를 읽는다.
- Windows(dev): PowerShell `Get-PhysicalDisk`(MediaType/BusType/FriendlyName/Size).
읽지 못하면 빈 목록으로 degrade(예외 금지).
"""

from __future__ import annotations

import json
import os
import subprocess

from ....core.domain.entities import PhysicalDisk

_TIMEOUT = 6
# 물리 디스크가 아닌 블록 디바이스 prefix (loop/ram/device-mapper/CD 등).
_SKIP_PREFIX = ("loop", "ram", "dm-", "sr", "md", "zram", "fd")


def read_physical_disks(sys_path: str = "/sys") -> list[PhysicalDisk]:
    try:
        return _windows() if os.name == "nt" else _linux(sys_path)
    except Exception:
        return []


# ---------- Linux (sysfs) ----------

def _linux(sys_path: str) -> list[PhysicalDisk]:
    block = os.path.join(sys_path, "block")
    if not os.path.isdir(block):
        return []
    out: list[PhysicalDisk] = []
    for name in sorted(os.listdir(block)):
        if name.startswith(_SKIP_PREFIX):
            continue
        base = os.path.join(block, name)
        rotational = _read_int(os.path.join(base, "queue", "rotational"))
        size_sectors = _read_int(os.path.join(base, "size"))
        model = _read_str(os.path.join(base, "device", "model"))
        is_nvme = name.startswith("nvme")
        if is_nvme:
            kind, bus = "NVMe", "nvme"
        elif rotational == 0:
            kind, bus = "SSD", None
        elif rotational == 1:
            kind, bus = "HDD", None
        else:
            kind, bus = "unknown", None
        out.append(
            PhysicalDisk(
                name=name,
                model=model,
                kind=kind,
                bus=bus,
                size_bytes=size_sectors * 512 if size_sectors else None,
            )
        )
    return out


def _read_int(path: str) -> int | None:
    try:
        with open(path) as fh:
            return int(fh.read().strip())
    except (OSError, ValueError):
        return None


def _read_str(path: str) -> str | None:
    try:
        with open(path) as fh:
            v = fh.read().strip()
            return v or None
    except OSError:
        return None


# ---------- Windows (Get-PhysicalDisk) ----------

def _windows() -> list[PhysicalDisk]:
    cmd = [
        "powershell",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-PhysicalDisk | Select-Object FriendlyName,"
        "@{n='Media';e={[string]$_.MediaType}},@{n='Bus';e={[string]$_.BusType}},Size"
        " | ConvertTo-Json -Compress",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=_TIMEOUT, check=False)
    if proc.returncode != 0 or not proc.stdout.strip():
        return []
    data = json.loads(proc.stdout)
    if isinstance(data, dict):
        data = [data]
    out: list[PhysicalDisk] = []
    for d in data:
        media = (d.get("Media") or "").strip()
        bus = (d.get("Bus") or "").strip()
        # NVMe 는 버스로 판별(가장 구체적) → 아니면 MediaType(SSD/HDD).
        if bus.lower() == "nvme":
            kind = "NVMe"
        elif media in ("SSD", "HDD"):
            kind = media
        else:
            kind = "unknown"
        out.append(
            PhysicalDisk(
                name=d.get("FriendlyName") or "disk",
                model=d.get("FriendlyName") or None,
                kind=kind,
                bus=bus or None,
                size_bytes=int(d["Size"]) if d.get("Size") else None,
            )
        )
    return out
