import type { DepartmentRepositoryPort } from '../core/application/ports/outbound';

/** DepartmentRepositoryPort Mock 팩토리 */
export const createDepartmentRepositoryMock = (): jest.Mocked<DepartmentRepositoryPort> => ({
  findManyRecordsByOrganizationId: jest.fn(),
  findOneRecordById: jest.fn(),
  createRecord: jest.fn(),
  updateNameRecord: jest.fn(),
  updateParentRecord: jest.fn(),
  deleteManyRecordsByIds: jest.fn(),
});
