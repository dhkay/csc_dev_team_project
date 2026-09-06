/**
 * file-upload 서버(스토리지 소유) 위임 Outbound Port.
 * 스토리지는 file-upload 가 소유하므로 control-tower 는 직접 파일을 만지지 않고 HTTP 로 위임한다.
 * (크로스-DB/소유권 규칙). 조직 하드 삭제 시 그 조직 소유 자산의 아카이브+삭제를 요청한다.
 */
export interface FileUploadApiPort {
  /** 조직 하드 삭제 정리: 그 조직 소유 자산을 2차 아카이브로 옮기고 1차에서 삭제. 멱등. 처리 수 반환 */
  archiveAndDeleteOrganization(organizationId: number): Promise<{ archived: number }>;
}

export const FILE_UPLOAD_API_PORT = Symbol('PLATFORM_FILE_UPLOAD_API_PORT');
