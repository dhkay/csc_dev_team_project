import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PlatformRootGuard } from '../../../../../../shared/guards';
import {
  SERVER_MONITORING_PORT,
  ServerMonitoringPort,
} from '../../../../core/application/ports/inbound/server-monitoring.port';
import {
  ProcessUsageResponseDto,
  ServerMetaResponseDto,
  ServerWithStatusResponseDto,
} from '../dto/metrics.response.dto';
import { HardwareInfoResponseDto } from '../dto/hardware.response.dto';

/**
 * 서버 모니터링 Inbound Adapter: ROOT 전용(PlatformRootGuard)
 * 전역 ServiceTokenGuard(서버 간) + PlatformRootGuard(플랫폼 ROOT JWT) 이중 보호. 내부망 전용
 * 각 호스트의 metrics-agent 로 팬아웃해 CPU/GPU/VRAM/RAM 스냅샷을 모은다.
 */
@ApiTags('server-monitoring')
@ApiBearerAuth()
@Controller('platform')
export class ServerMonitoringController {
  constructor(
    @Inject(SERVER_MONITORING_PORT)
    private readonly service: ServerMonitoringPort,
  ) {}

  /** 등록된 서버 메타 목록 */
  @ApiOperation({
    summary: '[SERVER-001] 서버 목록',
    description: '환경별 레지스트리에 등록된 서버 메타(id/label/role) 목록.',
  })
  @ApiOkResponse({ type: ServerMetaResponseDto, isArray: true })
  @Get('servers')
  @UseGuards(PlatformRootGuard)
  listServers() {
    return this.service.listServers();
  }

  /** 전 호스트 지표 스냅샷(팬아웃, 호스트별 실패는 offline) */
  @ApiOperation({
    summary: '[SERVER-002] 서버 지표 스냅샷',
    description: '전 호스트의 CPU/GPU/VRAM/RAM 스냅샷. 호스트별 실패는 offline 으로 격리.',
  })
  @ApiOkResponse({ type: ServerWithStatusResponseDto, isArray: true })
  @Get('servers/metrics')
  @UseGuards(PlatformRootGuard)
  getServersMetrics() {
    return this.service.getServersMetrics();
  }

  /** 특정 서버의 리소스(cpu|ram|gpu|vram) 점유 상위 프로세스(게이지 클릭 시 on-demand) */
  @ApiOperation({
    summary: '[SERVER-003] 리소스 점유 상위 프로세스',
    description: 'cpu|ram|gpu|vram 별 top consumers. 실패/미지원 시 빈 목록.',
  })
  @ApiOkResponse({ type: ProcessUsageResponseDto, isArray: true })
  @Get('servers/:id/top')
  @UseGuards(PlatformRootGuard)
  getServerTop(
    @Param('id') id: string,
    @Query('resource') resource = 'cpu',
    @Query('limit') limit = '5',
  ) {
    const n = Math.min(20, Math.max(1, Number(limit) || 5));
    return this.service.getServerTop(id, resource, n);
  }

  /** 특정 서버의 정적 하드웨어 상세(CPU/메모리 모듈/GPU/디스크) */
  @ApiOperation({
    summary: '[SERVER-004] 하드웨어 상세',
    description: 'CPU 제품명/코어, RAM 모듈(SMBIOS), GPU(드라이버/전력), 디스크.',
  })
  @ApiOkResponse({ type: HardwareInfoResponseDto })
  @Get('servers/:id/hardware')
  @UseGuards(PlatformRootGuard)
  getServerHardware(@Param('id') id: string) {
    return this.service.getServerHardware(id);
  }
}
