-- 조직유저 이메일: 조직 범위 유일 → 전역 유일.
--
-- 로그인은 이메일과 비밀번호만 받고 조직은 인증 이후 토큰으로 정해진다. 그래서 같은 이메일이 두
-- 조직에 있으면 어느 계정인지 정해지지 않고, 자격 조회(findOneByEmail)가 먼저 걸린 한 건을 집는다.
-- 한 사람은 한 조직에만 속하므로 조직 범위 유일이 주는 이점은 없고 이 모호함만 남는다.
--
-- 중복이 있으면 여기서 멈춘다. 남의 로그인 ID 를 마이그레이션이 임의로 바꾸는 편이 더 나쁘다.
-- 실패하면 아래 조회로 대상을 확인하고 해당 사용자와 협의해 정리한 뒤 다시 배포한다.
--   SELECT email, count(*), array_agg(organization_id) FROM organization_users
--   GROUP BY email HAVING count(*) > 1;
DO $$
DECLARE
  duplicates text;
BEGIN
  SELECT string_agg(email, ', ')
    INTO duplicates
    FROM (
      SELECT email FROM organization_users GROUP BY email HAVING count(*) > 1
    ) d;

  IF duplicates IS NOT NULL THEN
    RAISE EXCEPTION '조직유저 이메일 전역 유일 전환 불가. 조직을 넘어 중복된 이메일: %', duplicates;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_users_email_uq" ON "organization_users" USING btree ("email");--> statement-breakpoint
-- 전역 유일이 조직 범위 유일을 포함하므로 구 인덱스는 중복이다.
DROP INDEX "organization_users_org_email_uq";
