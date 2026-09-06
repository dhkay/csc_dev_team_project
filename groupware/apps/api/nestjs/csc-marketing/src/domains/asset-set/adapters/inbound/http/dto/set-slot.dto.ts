import { IsString, MaxLength, MinLength } from 'class-validator';

/** 슬롯에 지정할 업로드(file-upload uploadId). 슬롯(frame/outro)은 경로 파라미터 */
export class SetSlotDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  uploadId: string;
}
