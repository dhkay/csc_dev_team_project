-- 시드 공통 태그의 value(=AI 매칭 키)를 영문으로 재설정(표시명 label 은 한글 유지). data-only(스키마 변경 없음).
-- 자산-태그 링크는 tag_id 참조라 value 변경과 무관(고아 없음). 조직 태그는 건드리지 않는다(scope='common' 만).
-- (axis.category, axis.key, 현재 label) 로 특정해 안전하게 UPDATE.
UPDATE "marketing_asset_tags" t SET "value" = m.eng
FROM "marketing_asset_axes" a,
  (VALUES
    -- BGM 분위기
    ('BGM','mood','잔잔한','calm'),
    ('BGM','mood','밝은','bright'),
    ('BGM','mood','웅장한','grand'),
    ('BGM','mood','감성적','emotional'),
    ('BGM','mood','신나는','exciting'),
    -- BGM 템포
    ('BGM','tempo','느림','slow'),
    ('BGM','tempo','미디엄','medium'),
    ('BGM','tempo','빠름','fast'),
    -- BGM 장르
    ('BGM','genre','팝','pop'),
    ('BGM','genre','인디','indie'),
    ('BGM','genre','EDM','edm'),
    ('BGM','genre','어쿠스틱','acoustic'),
    ('BGM','genre','로파이','lofi'),
    ('BGM','genre','힙합','hiphop'),
    -- BGM 용도
    ('BGM','usage','감성 브이로그','emotional-vlog'),
    ('BGM','usage','제품 광고','product-ad'),
    ('BGM','usage','인트로','intro'),
    ('BGM','usage','아웃트로','outro'),
    -- 효과음 유형
    ('SFX','type','클릭','click'),
    ('SFX','type','팝','pop'),
    ('SFX','type','딩','ding'),
    ('SFX','type','휙','whoosh'),
    ('SFX','type','타이핑','typing'),
    ('SFX','type','박수','applause'),
    -- 효과음 용도
    ('SFX','usage','씬 전환','scene-transition'),
    ('SFX','usage','자막 강조','subtitle-emphasis'),
    ('SFX','usage','인트로','intro'),
    ('SFX','usage','아웃트로','outro'),
    ('SFX','usage','버튼/CTA','button-cta'),
    -- 효과음 분위기
    ('SFX','mood','밝은','bright'),
    ('SFX','mood','코믹','comic'),
    ('SFX','mood','긴장','tense'),
    ('SFX','mood','부드러운','soft')
  ) AS m(category, axis_key, label, eng)
WHERE t."axis_id" = a."id"
  AND a."category" = m.category
  AND a."key" = m.axis_key
  AND t."scope" = 'common'
  AND t."label" = m.label
  AND t."value" = m.label;
