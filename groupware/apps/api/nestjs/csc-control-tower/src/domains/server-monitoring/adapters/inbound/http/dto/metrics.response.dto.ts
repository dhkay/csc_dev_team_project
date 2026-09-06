import { ApiProperty } from '@nestjs/swagger';
import {
  CpuSnapshot,
  DiskSnapshot,
  GpuSnapshot,
  HostSnapshot,
  MemorySnapshot,
  ProcessUsage,
  ServerWithStatus,
} from '../../../../core/domain/metrics.types';
import { ServerMeta, ServerRole } from '../../../../core/domain/server.types';

/** 모니터링 대상 서버 메타(내부 주소는 노출하지 않는다) */
export class ServerMetaResponseDto implements ServerMeta {
  @ApiProperty({ description: '서버 식별자', example: 'web-server' })
  id: string;

  @ApiProperty({ description: '표시명', example: '웹 서버' })
  label: string;

  @ApiProperty({
    description: '역할: web(GPU 없음), ai(GPU), all(개발 단일 PC)',
    example: 'web',
  })
  role: ServerRole;
}

/** CPU 사용률 스냅샷 */
export class CpuSnapshotResponseDto implements CpuSnapshot {
  @ApiProperty({ description: '전체 사용률(%)', example: 23.4 })
  percent: number;

  @ApiProperty({ description: '코어별 사용률(%)', type: Number, isArray: true, example: [12.1, 30.5] })
  perCore: number[];

  @ApiProperty({ description: '논리 코어 수', example: 16 })
  cores: number;

  @ApiProperty({
    description: 'CPU 모델명. 수집하지 못하면 null',
    example: 'AMD Ryzen 9 7900X',
    nullable: true,
    required: false,
  })
  model?: string | null;
}

/** 메모리 사용량 스냅샷 */
export class MemorySnapshotResponseDto implements MemorySnapshot {
  @ApiProperty({ description: '전체 용량(바이트)', example: 68719476736 })
  totalBytes: number;

  @ApiProperty({ description: '사용 중 용량(바이트)', example: 21474836480 })
  usedBytes: number;

  @ApiProperty({ description: '사용률(%)', example: 31.2 })
  percent: number;
}

/** 디스크 사용량 스냅샷(대표 경로 1개) */
export class DiskSnapshotResponseDto implements DiskSnapshot {
  @ApiProperty({ description: '전체 용량(바이트)', example: 1000204886016 })
  totalBytes: number;

  @ApiProperty({ description: '사용 중 용량(바이트)', example: 412316860416 })
  usedBytes: number;

  @ApiProperty({ description: '사용률(%)', example: 41.2 })
  percent: number;

  @ApiProperty({ description: '측정 경로', example: '/' })
  path: string;
}

/** GPU 1개의 사용량 스냅샷 */
export class GpuSnapshotResponseDto implements GpuSnapshot {
  @ApiProperty({ description: 'GPU 번호', example: 0 })
  index: number;

  @ApiProperty({ description: 'GPU 이름', example: 'NVIDIA GeForce RTX 5070 Ti' })
  name: string;

  @ApiProperty({ description: 'GPU 사용률(%)', example: 78 })
  utilPercent: number;

  @ApiProperty({ description: 'GPU 메모리 전체(바이트)', example: 17179869184 })
  memTotalBytes: number;

  @ApiProperty({ description: 'GPU 메모리 사용(바이트)', example: 9663676416 })
  memUsedBytes: number;

  @ApiProperty({ description: 'GPU 메모리 사용률(%)', example: 56.3 })
  memPercent: number;

  @ApiProperty({ description: '온도(섭씨). 수집하지 못하면 null', example: 61, nullable: true, required: false })
  tempC?: number | null;

  @ApiProperty({ description: '소비 전력(W). 수집하지 못하면 null', example: 220, nullable: true, required: false })
  powerW?: number | null;
}

/** 한 서버의 지표 스냅샷 */
export class HostSnapshotResponseDto implements HostSnapshot {
  @ApiProperty({
    description: '수집 대상 호스트',
    example: { id: 'web-server', label: '웹 서버', role: 'web' },
  })
  host: { id: string; label: string; role: string };

  @ApiProperty({ description: '수집 시각(ISO 8601)', example: '2026-08-12T05:00:00.000Z' })
  timestamp: string;

  @ApiProperty({ description: 'CPU', type: CpuSnapshotResponseDto })
  cpu: CpuSnapshotResponseDto;

  @ApiProperty({ description: '메모리', type: MemorySnapshotResponseDto })
  memory: MemorySnapshotResponseDto;

  @ApiProperty({
    description: '디스크. 수집하지 못하면 null',
    type: DiskSnapshotResponseDto,
    nullable: true,
  })
  disk: DiskSnapshotResponseDto | null;

  @ApiProperty({ description: 'GPU 목록. 없으면 빈 배열', type: GpuSnapshotResponseDto, isArray: true })
  gpus: GpuSnapshotResponseDto[];
}

/** 서버 1대의 연결 상태와 지표. 응답이 없으면 status=offline 이고 metrics 는 null 이다. */
export class ServerWithStatusResponseDto implements ServerWithStatus {
  @ApiProperty({ description: '서버 식별자', example: 'web-server' })
  id: string;

  @ApiProperty({ description: '표시명', example: '웹 서버' })
  label: string;

  @ApiProperty({ description: '역할', example: 'web' })
  role: ServerRole;

  @ApiProperty({ description: '연결 상태', enum: ['online', 'offline'], example: 'online' })
  status: 'online' | 'offline';

  @ApiProperty({
    description: '지표 스냅샷. 응답하지 않는 서버는 null',
    type: HostSnapshotResponseDto,
    nullable: true,
  })
  metrics: HostSnapshotResponseDto | null;
}

/** 리소스를 많이 쓰는 프로세스 1건 */
export class ProcessUsageResponseDto implements ProcessUsage {
  @ApiProperty({ description: '프로세스 id', example: 4821 })
  pid: number;

  @ApiProperty({ description: '프로세스 이름', example: 'node' })
  name: string;

  @ApiProperty({ description: '점유율(%)', example: 12.5 })
  percent: number;

  @ApiProperty({
    description: '메모리 점유(바이트). cpu 기준 조회면 null',
    example: 524288000,
    nullable: true,
  })
  bytes: number | null;
}
