import { IsString, MaxLength } from 'class-validator';

/**
 * 컨셉 한 축의 선택: 어느 축에서 어느 선택지를 골랐는가만 보낸다.
 *
 * 그 선택지의 이름과 감독 노트는 서버 카탈로그(/brand-concept-catalog)가 정하므로 요청에 담지 않는다.
 * 문구를 요청에서 받으면 화면과 모델이 서로 다른 문구를 보게 되고, 문구 자리에 임의 지시를 넣을 수도 있다.
 *
 * 세 곳이 같은 값을 나른다: 세트 저장, 생성 요청의 이번 회차 조합, 기획안에 저장하는 스냅샷
 * 한 정의를 공유하지 않으면 어느 한 곳의 길이 제한이 조용히 어긋난다.
 */
export class ConceptChoiceDto {
  @IsString()
  @MaxLength(32)
  axis: string;

  @IsString()
  @MaxLength(64)
  option: string;
}
