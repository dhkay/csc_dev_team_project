"""물리 메모리 모듈(SMBIOS) 조회: on-demand.

- Linux(prod): `dmidecode -t 17`(Memory Device) 파싱. root + DMI 접근 필요(에이전트 컨테이너 root).
- Windows(dev): PowerShell `Get-CimInstance Win32_PhysicalMemory`.
읽지 못하면 빈 목록으로 degrade(예외 금지). 무겁지만 클릭 시에만 호출된다.
"""

from __future__ import annotations

import json
import os
import re
import subprocess

from ....core.domain.entities import MemoryModule

_TIMEOUT = 6

# Windows SMBIOSMemoryType → 표기.
_SMBIOS_TYPE = {
    20: "DDR",
    21: "DDR2",
    24: "DDR3",
    26: "DDR4",
    34: "DDR5",
    30: "LPDDR4",
    35: "LPDDR5",
}


def read_memory_modules() -> list[MemoryModule]:
    try:
        return _windows_modules() if os.name == "nt" else _linux_modules()
    except Exception:
        return []


# ---------- Linux (dmidecode) ----------

def _linux_modules() -> list[MemoryModule]:
    proc = subprocess.run(
        ["dmidecode", "-t", "17"],
        capture_output=True,
        text=True,
        timeout=_TIMEOUT,
        check=False,
    )
    if proc.returncode != 0 or not proc.stdout:
        return []
    modules: list[MemoryModule] = []
    for block in proc.stdout.split("\n\n"):
        if "Memory Device" not in block:
            continue
        fields = {}
        for line in block.splitlines():
            if ":" in line:
                k, _, v = line.strip().partition(":")
                fields[k.strip()] = v.strip()
        size = fields.get("Size", "")
        if not size or "No Module" in size or size == "Unknown":
            continue  # 빈 슬롯 제외.
        modules.append(
            MemoryModule(
                slot=fields.get("Locator") or None,
                size_bytes=_parse_size(size),
                kind=(fields.get("Type") or None) if fields.get("Type") != "Unknown" else None,
                speed_mhz=_parse_mhz(fields.get("Speed", "")),
                manufacturer=_clean(fields.get("Manufacturer")),
                part_number=_clean(fields.get("Part Number")),
            )
        )
    return modules


def _parse_size(s: str) -> int | None:
    m = re.match(r"(\d+)\s*(GB|MB|TB)", s, re.IGNORECASE)
    if not m:
        return None
    n = int(m.group(1))
    unit = m.group(2).upper()
    mult = {"MB": 1024**2, "GB": 1024**3, "TB": 1024**4}[unit]
    return n * mult


def _parse_mhz(s: str) -> int | None:
    m = re.match(r"(\d+)", s)
    return int(m.group(1)) if m else None


def _clean(v: str | None) -> str | None:
    if not v:
        return None
    v = v.strip()
    return None if v in ("", "Unknown", "Not Specified", "None") else v


# ---------- Windows (WMI via PowerShell) ----------

def _windows_modules() -> list[MemoryModule]:
    cmd = [
        "powershell",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_PhysicalMemory | "
        "Select-Object DeviceLocator,Capacity,ConfiguredClockSpeed,Speed,"
        "Manufacturer,PartNumber,SMBIOSMemoryType | ConvertTo-Json -Compress",
    ]
    proc = subprocess.run(
        cmd, capture_output=True, text=True, timeout=_TIMEOUT, check=False
    )
    if proc.returncode != 0 or not proc.stdout.strip():
        return []
    data = json.loads(proc.stdout)
    if isinstance(data, dict):
        data = [data]
    modules: list[MemoryModule] = []
    for d in data:
        cap = d.get("Capacity")
        speed = d.get("ConfiguredClockSpeed") or d.get("Speed")
        modules.append(
            MemoryModule(
                slot=_clean(d.get("DeviceLocator")),
                size_bytes=int(cap) if cap else None,
                kind=_SMBIOS_TYPE.get(int(d["SMBIOSMemoryType"]))
                if d.get("SMBIOSMemoryType")
                else None,
                speed_mhz=int(speed) if speed else None,
                manufacturer=_clean(d.get("Manufacturer")),
                part_number=_clean(d.get("PartNumber")),
            )
        )
    return modules
