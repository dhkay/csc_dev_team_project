import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationService } from '../organization.service';
import { USER_API_PORT, UserApiPort } from '../../ports/outbound/user-api.port';
import {
  FILE_UPLOAD_API_PORT,
  FileUploadApiPort,
} from '../../ports/outbound/file-upload-api.port';

describe('OrganizationService (platform)', () => {
  let service: OrganizationService;
  let userApi: jest.Mocked<UserApiPort>;
  let fileUploadApi: jest.Mocked<FileUploadApiPort>;

  const ORG_ID = 12;

  beforeEach(async () => {
    userApi = {
      purgeOrganization: jest.fn().mockResolvedValue(undefined),
      recoverOrganization: jest.fn().mockResolvedValue({ id: ORG_ID }),
      withdrawOrganization: jest.fn(),
      createOrganization: jest.fn(),
      listOrganizations: jest.fn(),
      updateOrganization: jest.fn(),
      getRootAdmin: jest.fn(),
      resetRootPassword: jest.fn(),
      getOrganizationAiTools: jest.fn(),
      listAiToolCatalog: jest.fn(),
      updateAiTool: jest.fn(),
      listAdmins: jest.fn(),
      createAdmin: jest.fn(),
      updateAdmin: jest.fn(),
      deleteAdmin: jest.fn(),
      getAdminFeatures: jest.fn(),
      setAdminFeatures: jest.fn(),
      listAdminFeatureCatalog: jest.fn(),
    } as unknown as jest.Mocked<UserApiPort>;
    fileUploadApi = {
      archiveAndDeleteOrganization: jest.fn().mockResolvedValue({ archived: 3 }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationService,
        { provide: USER_API_PORT, useValue: userApi },
        { provide: FILE_UPLOAD_API_PORT, useValue: fileUploadApi },
      ],
    }).compile();

    service = moduleRef.get(OrganizationService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('purgeCompany', () => {
    it('user 조직 purge 후 file-upload 스토리지 정리를 위임한다', async () => {
      await service.purgeCompany(ORG_ID);

      expect(userApi.purgeOrganization).toHaveBeenCalledWith(ORG_ID);
      expect(fileUploadApi.archiveAndDeleteOrganization).toHaveBeenCalledWith(ORG_ID);
    });

    it('스토리지 정리 실패는 삼킨다(조직 삭제는 이미 확정: best-effort)', async () => {
      fileUploadApi.archiveAndDeleteOrganization.mockRejectedValueOnce(new Error('down'));

      await expect(service.purgeCompany(ORG_ID)).resolves.toBeUndefined();
      expect(userApi.purgeOrganization).toHaveBeenCalledWith(ORG_ID);
    });
  });

  describe('recoverCompany', () => {
    it('user 서버 복구에 위임한다', async () => {
      await service.recoverCompany(ORG_ID);
      expect(userApi.recoverOrganization).toHaveBeenCalledWith(ORG_ID);
    });
  });
});
