import { ApiProperty } from '@nestjs/swagger';
import {
  CpuHardware,
  DiskHardware,
  GpuHardware,
  HardwareInfo,
  MemoryHardware,
  MemoryModule,
  PhysicalDisk,
} from '../../../../core/domain/metrics.types';

/** CPU 하드웨어 상세. 수집하지 못한 항목은 null 로 온다. */
export class CpuHardwareResponseDto implements CpuHardware {
  @ApiProperty({ description: '모델명', example: 'AMD Ryzen 9 7900X', nullable: true })
  model: string | null;

  @ApiProperty({ description: '물리 코어 수', example: 12, nullable: true })
  physicalCores: number | null;

  @ApiProperty({ description: '논리 코어 수', example: 24, nullable: true })
  logicalCores: number | null;

  @ApiProperty({ description: '기본 클럭(MHz)', example: 4700, nullable: true })
  baseMhz: number | null;

  @ApiProperty({ description: '최대 클럭(MHz)', example: 5600, nullable: true })
  maxMhz: number | null;

  @ApiProperty({ description: '아키텍처', example: 'x86_64', nullable: true })
  arch: string | null;
}

/** 메모리 슬롯 1개 */
export class MemoryModuleResponseDto implements MemoryModule {
  @ApiProperty({ description: '슬롯 이름', example: 'DIMM 0', nullable: true })
  slot: string | null;

  @ApiProperty({ description: '용량(바이트)', example: 17179869184, nullable: true })
  sizeBytes: number | null;

  @ApiProperty({ description: '규격', example: 'DDR5', nullable: true })
  kind: string | null;

  @ApiProperty({ description: '속도(MHz)', example: 5600, nullable: true })
  speedMhz: number | null;

  @ApiProperty({ description: '제조사', example: 'Samsung', nullable: true })
  manufacturer: string | null;

  @ApiProperty({ description: '부품 번호', example: 'M323R2GA3BB0', nullable: true })
  partNumber: string | null;
}

/** 메모리 하드웨어 상세 */
export class MemoryHardwareResponseDto implements MemoryHardware {
  @ApiProperty({ description: '전체 용량(바이트)', example: 68719476736 })
  totalBytes: number;

  @ApiProperty({
    description: '슬롯 목록. 수집하지 못하면 빈 배열',
    type: MemoryModuleResponseDto,
    isArray: true,
  })
  modules: MemoryModuleResponseDto[];
}

/** GPU 하드웨어 상세 */
export class GpuHardwareResponseDto implements GpuHardware {
  @ApiProperty({ description: 'GPU 번호', example: 0 })
  index: number;

  @ApiProperty({ description: 'GPU 이름', example: 'NVIDIA GeForce RTX 5070 Ti' })
  name: string;

  @ApiProperty({ description: 'GPU 메모리 전체(바이트)', example: 17179869184 })
  memTotalBytes: number;

  @ApiProperty({ description: '드라이버 버전', example: '560.94', nullable: true })
  driverVersion: string | null;

  @ApiProperty({ description: 'VBIOS 버전', example: '95.02.3C.00.01', nullable: true })
  vbios: string | null;

  @ApiProperty({ description: '온도(섭씨)', example: 45, nullable: true })
  tempC: number | null;

  @ApiProperty({ description: '소비 전력(W)', example: 120, nullable: true })
  powerW: number | null;

  @ApiProperty({ description: '전력 상한(W)', example: 300, nullable: true })
  powerLimitW: number | null;
}

/** 물리 디스크 1개 */
export class PhysicalDiskResponseDto implements PhysicalDisk {
  @ApiProperty({ description: '장치 이름', example: 'nvme0n1' })
  name: string;

  @ApiProperty({ description: '모델명', example: 'Samsung SSD 990 PRO 1TB', nullable: true })
  model: string | null;

  @ApiProperty({ description: '종류: SSD, HDD, NVMe, unknown', example: 'NVMe' })
  kind: string;

  @ApiProperty({ description: '연결 방식', example: 'PCIe', nullable: true })
  bus: string | null;

  @ApiProperty({ description: '용량(바이트)', example: 1000204886016, nullable: true })
  sizeBytes: number | null;
}

/** 마운트된 파일시스템 1개의 사용량 */
export class DiskHardwareResponseDto implements DiskHardware {
  @ApiProperty({ description: '장치', example: '/dev/nvme0n1p2', nullable: true })
  device: string | null;

  @ApiProperty({ description: '마운트 지점', example: '/', nullable: true })
  mountpoint: string | null;

  @ApiProperty({ description: '파일시스템 종류', example: 'ext4', nullable: true })
  fstype: string | null;

  @ApiProperty({ description: '전체 용량(바이트)', example: 1000204886016 })
  totalBytes: number;

  @ApiProperty({ description: '사용 중 용량(바이트)', example: 412316860416 })
  usedBytes: number;

  @ApiProperty({ description: '사용률(%)', example: 41.2 })
  percent: number;
}

/** 서버 1대의 정적 하드웨어 상세 */
export class HardwareInfoResponseDto implements HardwareInfo {
  @ApiProperty({ description: 'CPU', type: CpuHardwareResponseDto })
  cpu: CpuHardwareResponseDto;

  @ApiProperty({ description: '메모리', type: MemoryHardwareResponseDto })
  memory: MemoryHardwareResponseDto;

  @ApiProperty({ description: 'GPU 목록. 없으면 빈 배열', type: GpuHardwareResponseDto, isArray: true })
  gpus: GpuHardwareResponseDto[];

  @ApiProperty({ description: '물리 디스크 목록', type: PhysicalDiskResponseDto, isArray: true })
  physicalDisks: PhysicalDiskResponseDto[];

  @ApiProperty({ description: '마운트된 파일시스템 목록', type: DiskHardwareResponseDto, isArray: true })
  disks: DiskHardwareResponseDto[];
}
