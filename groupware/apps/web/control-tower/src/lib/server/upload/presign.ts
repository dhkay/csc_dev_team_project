/**
 * file-upload presign 응답(와이어 형태 그대로: snake_case)
 * 이미지, 공통 에셋, 에셋 세트 세 BFF 라우트가 같은 응답을 받으므로 한 곳에서만 정의한다.
 * 필드 이름을 바꾸는 쪽은 file-upload 서버이며, 그때 고칠 자리도 여기 하나다.
 */
export interface PresignResponse {
  upload_id: string;
  presigned_url: string;
}
