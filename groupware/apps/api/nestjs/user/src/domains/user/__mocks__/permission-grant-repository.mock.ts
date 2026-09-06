import type { PermissionGrantRepositoryPort } from '../core/application/ports/outbound/permission-grant-repository.port';

/** PermissionGrantRepositoryPort Mock 팩토리 */
export const createPermissionGrantRepositoryMock =
  (): jest.Mocked<PermissionGrantRepositoryPort> => ({
    findGrantMatrixByOrganizationId: jest.fn(),
    setDepartmentPermissionsRecord: jest.fn(),
    setUserPermissionsRecord: jest.fn(),
  });
