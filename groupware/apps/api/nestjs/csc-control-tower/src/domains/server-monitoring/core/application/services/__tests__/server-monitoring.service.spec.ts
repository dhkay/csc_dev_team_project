import { Test, TestingModule } from '@nestjs/testing';
import { ServerMonitoringService } from '../server-monitoring.service';
import { SERVER_REGISTRY_PORT } from '../../ports/outbound/server-registry.port';
import {
  METRICS_SOURCE_RESOLVER,
  MetricsSourcePort,
} from '../../ports/outbound/metrics-source.port';
import { RegisteredServer } from '../../../domain/server.types';
import { HostSnapshot } from '../../../domain/metrics.types';

const makeServer = (over: Partial<RegisteredServer> = {}): RegisteredServer => ({
  id: 'dev-local',
  label: 'Local PC',
  role: 'all',
  sourceType: 'agent',
  baseUrl: 'http://agent:8000',
  ...over,
});

const makeSnapshot = (id: string): HostSnapshot => ({
  host: { id, label: id, role: 'all' },
  timestamp: '2026-07-06T00:00:00Z',
  cpu: { percent: 10, perCore: [10], cores: 1 },
  memory: { totalBytes: 100, usedBytes: 40, percent: 40 },
  disk: null,
  gpus: [],
});

describe('ServerMonitoringService', () => {
  let service: ServerMonitoringService;
  const registry = { list: jest.fn() };
  const source: jest.Mocked<MetricsSourcePort> = {
    fetchSnapshot: jest.fn(),
    fetchTop: jest.fn(),
    fetchHardware: jest.fn(),
  };
  const resolver = { for: jest.fn(() => source) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServerMonitoringService,
        { provide: SERVER_REGISTRY_PORT, useValue: registry },
        { provide: METRICS_SOURCE_RESOLVER, useValue: resolver },
      ],
    }).compile();
    service = module.get(ServerMonitoringService);
  });

  afterEach(() => jest.clearAllMocks());

  it('listServers 는 baseUrl/sourceType 을 제외한 메타만 노출해야 한다', () => {
    registry.list.mockReturnValue([makeServer()]);
    expect(service.listServers()).toEqual([{ id: 'dev-local', label: 'Local PC', role: 'all' }]);
  });

  it('온라인 호스트는 status=online + metrics 를 담아야 한다', async () => {
    registry.list.mockReturnValue([makeServer()]);
    source.fetchSnapshot.mockResolvedValueOnce(makeSnapshot('dev-local'));

    const result = await service.getServersMetrics();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('online');
    expect(result[0].metrics?.host.id).toBe('dev-local');
  });

  it('한 호스트 실패는 offline 으로 격리하고 나머지는 online 을 유지해야 한다', async () => {
    registry.list.mockReturnValue([
      makeServer({ id: 'a' }),
      makeServer({ id: 'b' }),
    ]);
    source.fetchSnapshot
      .mockResolvedValueOnce(makeSnapshot('a'))
      .mockRejectedValueOnce(new Error('timeout'));

    const result = await service.getServersMetrics();

    expect(result[0]).toMatchObject({ id: 'a', status: 'online' });
    expect(result[1]).toMatchObject({ id: 'b', status: 'offline', metrics: null });
  });

  it('getServerTop 은 등록된 서버의 소스로 위임한다', async () => {
    registry.list.mockReturnValue([makeServer({ id: 'dev-local' })]);
    source.fetchTop.mockResolvedValueOnce([
      { pid: 1, name: 'node', percent: 42, bytes: null },
    ]);

    const result = await service.getServerTop('dev-local', 'cpu', 5);

    expect(result[0].name).toBe('node');
    expect(source.fetchTop).toHaveBeenCalledWith(expect.objectContaining({ id: 'dev-local' }), 'cpu', 5);
  });

  it('getServerTop 은 알 수 없는 리소스면 빈 목록', async () => {
    registry.list.mockReturnValue([makeServer({ id: 'dev-local' })]);
    await expect(service.getServerTop('dev-local', 'bogus', 5)).resolves.toEqual([]);
    expect(source.fetchTop).not.toHaveBeenCalled();
  });

  it('getServerTop 은 알 수 없는 서버면 404', async () => {
    registry.list.mockReturnValue([]);
    await expect(service.getServerTop('nope', 'cpu', 5)).rejects.toThrow();
  });
});
