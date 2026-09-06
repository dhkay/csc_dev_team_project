import { Test, TestingModule } from '@nestjs/testing';
import { RbfrFormulaSensoryStabilityService } from '../rbfr-formula-sensory-stability.service';
import { RBFR_FORMULA_SENSORY_STABILITY_REPOSITORY_PORT } from '../../ports/outbound';
import type { RbfrFormulaSensoryStabilityRepositoryPort } from '../../ports/outbound';
import type { FormulaSensoryStabilityRecord } from '../../../domain/types';

describe('RbfrFormulaSensoryStabilityService', () => {
  let service: RbfrFormulaSensoryStabilityService;
  let repository: jest.Mocked<RbfrFormulaSensoryStabilityRepositoryPort>;

  beforeEach(async () => {
    repository = { createRecord: jest.fn(), listRecords: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbfrFormulaSensoryStabilityService,
        { provide: RBFR_FORMULA_SENSORY_STABILITY_REPOSITORY_PORT, useValue: repository },
      ],
    }).compile();

    service = module.get(RbfrFormulaSensoryStabilityService);
  });

  it('addRecord는 repository의 createRecord를 그대로 위임한다', async () => {
    const record: FormulaSensoryStabilityRecord = {
      id: 1,
      formulaId: 10,
      dataSource: 'lab_test',
      createdAt: '2026-09-06T00:00:00.000Z',
    };
    repository.createRecord.mockResolvedValueOnce(record);

    const result = await service.addRecord(10, { dataSource: 'lab_test' });

    expect(result).toEqual(record);
    expect(repository.createRecord).toHaveBeenCalledWith(10, { dataSource: 'lab_test' });
  });

  it('listRecords는 repository의 listRecords를 그대로 위임한다', async () => {
    repository.listRecords.mockResolvedValueOnce([]);
    const result = await service.listRecords(10);
    expect(result).toEqual([]);
    expect(repository.listRecords).toHaveBeenCalledWith(10);
  });
});
