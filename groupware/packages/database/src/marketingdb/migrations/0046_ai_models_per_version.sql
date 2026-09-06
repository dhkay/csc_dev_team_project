-- 개인 AI 모델 선택을 버전(UI 모드)별로 가른다.
-- settings 는 선택 하나가 아니라 '버전 → 선택' 맵이 된다(스키마 변경 없음: 같은 text 안의 형태만 바뀐다).
-- 기존 행은 없어 데이터 변환이 필요 없다. 있었다면 그 선택을 기본 버전 키 아래로 감싸야 한다.
ALTER TABLE "marketing_user_ai_models" ADD COLUMN "version_mode" varchar(16) DEFAULT 'v1.5' NOT NULL;