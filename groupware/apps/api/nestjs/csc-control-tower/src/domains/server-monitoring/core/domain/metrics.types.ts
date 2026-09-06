/**
 * 지표 스냅샷 타입: metrics-agent 의 GET /metrics/snapshot 와이어 계약(camelCase)과 1:1 대응
 * (계약 SSOT: apps/api/fastapi/metrics-agent 의 schemas.py)
 */

import type { ServerRole } from './server.types';

export interface CpuSnapshot {
  percent: number;
  perCore: number[];
  cores: number;
  model?: string | null;
}

export interface MemorySnapshot {
  totalBytes: number;
  usedBytes: number;
  percent: number;
}

export interface DiskSnapshot {
  totalBytes: number;
  usedBytes: number;
  percent: number;
  path: string;
}

export interface GpuSnapshot {
  index: number;
  name: string;
  utilPercent: number;
  memTotalBytes: number;
  memUsedBytes: number;
  memPercent: number;
  tempC?: number | null;
  powerW?: number | null;
}

/** 에이전트가 반환하는 한 호스트의 스냅샷 */
export interface HostSnapshot {
  host: { id: string; label: string; role: string };
  timestamp: string;
  cpu: CpuSnapshot;
  memory: MemorySnapshot;
  disk: DiskSnapshot | null;
  gpus: GpuSnapshot[];
}

/** 리소스를 점유하는 프로세스 1개(top consumers) */
export interface ProcessUsage {
  pid: number;
  name: string;
  percent: number;
  bytes: number | null;
}

// 정적 하드웨어 상세(on-demand): 에이전트 /metrics/hardware 계약 대응
export interface CpuHardware {
  model: string | null;
  physicalCores: number | null;
  logicalCores: number | null;
  baseMhz: number | null;
  maxMhz: number | null;
  arch: string | null;
}
export interface MemoryModule {
  slot: string | null;
  sizeBytes: number | null;
  kind: string | null;
  speedMhz: number | null;
  manufacturer: string | null;
  partNumber: string | null;
}
export interface MemoryHardware {
  totalBytes: number;
  modules: MemoryModule[];
}
export interface GpuHardware {
  index: number;
  name: string;
  memTotalBytes: number;
  driverVersion: string | null;
  vbios: string | null;
  tempC: number | null;
  powerW: number | null;
  powerLimitW: number | null;
}
export interface PhysicalDisk {
  name: string;
  model: string | null;
  kind: string; // SSD | HDD | NVMe | unknown
  bus: string | null;
  sizeBytes: number | null;
}
export interface DiskHardware {
  device: string | null;
  mountpoint: string | null;
  fstype: string | null;
  totalBytes: number;
  usedBytes: number;
  percent: number;
}
export interface HardwareInfo {
  cpu: CpuHardware;
  memory: MemoryHardware;
  gpus: GpuHardware[];
  physicalDisks: PhysicalDisk[];
  disks: DiskHardware[];
}

/** 레지스트리 메타 + 온라인 상태 + (온라인 시) 스냅샷: 프론트 그리드 카드 1개 */
export interface ServerWithStatus {
  id: string;
  label: string;
  role: ServerRole;
  status: 'online' | 'offline';
  metrics: HostSnapshot | null;
}
