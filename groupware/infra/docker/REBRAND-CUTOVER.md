# ESCOA → CSC 리브랜드 컷오버 런북 (1회)

리브랜드로 Docker **compose 프로젝트명**이 `escoa-{env}-web/ai` → `csc-{env}-web/ai` 로 바뀌었다.
네임드 볼륨 prefix 도 `escoa-*_<vol>` → `csc-*_<vol>` 로 바뀌므로, **그냥 배포하면 Postgres/certbot 이
빈 볼륨으로 떠서 데이터가 사라진 것처럼 보인다.** 아래 절차로 데이터를 이관하며 컷오버한다.

- **일시 중단 허용** 전제(스택을 내렸다 올림).
- **데이터 보유 = web-server** (pg_data, certbot). **video-ai-server = 무상태**(볼륨 없음 → 재생성만).
  - 단, video-ai-server 에 남은 `escoa-*-ai_pg_data` 는 현행 compose 가 참조하지 않는 **고아 잔재**다(이관 불필요, 추후 정리).
- 기존 `escoa-*` 볼륨은 검증 전까지 **보존**(롤백 백업). 업로드물은 호스트 바인드(`~/Storage/{env}`)라 영향 없음.

> **주의:** 컷오버는 **자동 배포(main 머지)로 처리하지 말 것.** 자동 deploy 는 `up -d` 만 해서 빈 csc 볼륨을
> 만든다. 반드시 아래 수동 절차로 먼저 이관한 뒤 올린다(또는 이관 후 배포).

> **주의:** **클론 디렉터리 경로도 바뀐다.** 배포 워크플로우의 클론 경로 기본값이
> `~/Projects/escoa_project/{staging,prod}` → `~/Projects/csc_project/{staging,prod}` 로 바뀌었다.
> 서버의 기존 클론을 새 경로로 **이동**하지 않으면 self-hosted 러너가
> `git 클론이 없음` 으로 즉시 실패한다(아래 0단계).

> **주의:** **브랜치 단계 주의: staging 먼저, prod 는 main 에 리브랜드가 머지된 뒤.**
> 리브랜드는 dev→staging→main 순으로 흐른다. **staging 클론만 먼저** 컷오버하고,
> prod 클론/스택은 `escoa-*` 그대로 두었다가 리브랜드가 `main` 에 도달했을 때 동일 절차로 컷오버한다.
> (코드가 escoa 인 채로 prod 를 csc 로 올릴 수 없다. compose name 이 아직 `escoa-prod-web`.)

> **주의:** **DB 슈퍼유저 롤 불일치: 반드시 처리(아래 3b).** 이관한 pg_data 클러스터의 슈퍼유저 롤은
> 옛 기본값 `escoa` 인데, csc compose 기본값은 `${POSTGRES_USER:-csc}` 라 그대로 올리면
> `FATAL: role "csc" does not exist` 로 실패한다. 이관 직후 롤을 `escoa`→`csc` 로 rename 한다.

---

## web-server (staging + prod)

> 아래는 staging+prod 를 한꺼번에 적은 절차다. 실제로는 **브랜치 단계 주의**(위)대로
> 리브랜드가 도달한 환경(먼저 staging, 이후 main 머지 시 prod)만 골라 같은 흐름으로 처리한다.

```bash
# 1) 현재(escoa) 스택 정지: 코드 reset 전이라 compose name 이 escoa-* 라 매칭됨. 볼륨 유지.
cd ~/Projects/escoa_project/staging && docker compose -f infra/docker/staging/web/docker-compose.yml down
cd ~/Projects/escoa_project/prod    && docker compose -f infra/docker/prod/web/docker-compose.yml down

# 2) 클론을 새 워크플로우 경로(csc_project)로 이동 + 리브랜드 코드 반영.
#    (escoa_project/infra 의 marketing-automation 등 무관한 디렉터리는 건드리지 않도록 클론만 이동)
mkdir -p ~/Projects/csc_project
mv ~/Projects/escoa_project/staging ~/Projects/csc_project/staging
mv ~/Projects/escoa_project/prod    ~/Projects/csc_project/prod
cd ~/Projects/csc_project/staging && git fetch --prune origin && git checkout staging && git reset --hard origin/staging
cd ~/Projects/csc_project/prod    && git fetch --prune origin && git checkout main    && git reset --hard origin/main
#    → compose name 이 csc-* 로 바뀜. (.env 는 untracked 라 reset 후에도 보존된다)
#    ※ video-ai-server 는 git 자격증명(gh)이 없으면 수동 fetch 가 실패한다 → 클론만 새 경로로 옮긴 뒤
#       self-hosted 러너(토큰 보유)로 배포(re-run CI)하거나, 자격증명을 먼저 구성한다.

# 3) 볼륨 데이터 이관 (escoa-*_<vol> → csc-*_<vol>, 기존 보존)
bash ~/Projects/csc_project/staging/scripts/deploy/migrate-volumes-csc.sh

# 3b) DB 슈퍼유저 롤 rename (escoa→csc): 이관 클러스터는 옛 롤 escoa 로 초기화돼 있다.
#     접속 중인 롤은 rename 불가하므로 임시 슈퍼유저로 접속해 바꾼다(컨테이너 로컬 소켓은 trust).
#     스택을 올리기 전, 대상 db 컨테이너만 먼저 띄운 상태에서 수행한다.
#     <PW> 는 그 환경의 .env POSTGRES_PASSWORD 값(staging 미설정 시 기본 'csc').
for env in csc-staging-web csc-prod-web; do
  docker exec ${env}-db psql -U escoa -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE _migrate WITH LOGIN SUPERUSER;"
  docker exec ${env}-db psql -U _migrate -d postgres -v ON_ERROR_STOP=1 \
    -c "ALTER ROLE escoa RENAME TO csc;" -c "ALTER ROLE csc WITH PASSWORD '<PW>';"
  docker exec ${env}-db psql -U csc -d postgres -v ON_ERROR_STOP=1 -c "DROP ROLE _migrate;"
done

# 4) 새(csc) 스택 기동: 순서 중요: staging web 먼저(네트워크 csc-staging-web_default 를
#    prod 가 external 로 참조), 그다음 prod web. deploy.sh 가 base 이미지 빌드+DB ensure+
#    마이그레이션+up+헬스체크까지 한다(권장). 러너로 배포 시 re-run CI 로 대체 가능.
bash ~/Projects/csc_project/staging/scripts/deploy/deploy.sh ~/Projects/csc_project/staging/infra/docker/staging/web/docker-compose.yml
bash ~/Projects/csc_project/prod/scripts/deploy/deploy.sh    ~/Projects/csc_project/prod/infra/docker/prod/web/docker-compose.yml

# 5) 검증: DB 데이터/로그인, nginx, 인증서
docker exec csc-staging-web-db psql -U csc -d userdb -c 'select count(*) from organization_users;'  # 데이터 보존 확인
docker exec csc-prod-web-db    psql -U csc -d userdb -c '\dt' | head

# 6) 검증 OK 후 기존 escoa 자원 정리(선택)
docker volume ls   | grep '^.*escoa-'   # 확인 후
# docker volume rm escoa-prod-web_pg_data escoa-prod-web_certbot_certs escoa-prod-web_certbot_webroot escoa-staging-web_pg_data
docker network ls  | grep escoa-        # escoa-*_default 잔여 시 docker network rm
```

## video-ai-server (staging + prod): 무상태, 볼륨 이관 불필요

> video-ai-server 는 git 자격증명(gh)이 없어 **수동 `git fetch` 가 실패**한다. 클론만 새 경로로 옮긴 뒤
> **self-hosted 러너(토큰 보유)로 배포(re-run CI)** 하는 것이 가장 간단하다. web 스택이 먼저 떠 있어야 함(LAN 의존).

```bash
# 1) escoa ai 스택 정지 + 클론을 새 경로로 이동(자격증명 있으면 reset, 없으면 러너에 위임)
cd ~/Projects/escoa_project/staging && docker compose -f infra/docker/staging/ai/docker-compose.yml down
cd ~/Projects/escoa_project/prod    && docker compose -f infra/docker/prod/ai/docker-compose.yml down
mkdir -p ~/Projects/csc_project
mv ~/Projects/escoa_project/staging ~/Projects/csc_project/staging
mv ~/Projects/escoa_project/prod    ~/Projects/csc_project/prod

# 2) 배포: 권장: staging 워크플로우를 re-run 해서 러너가 git reset + 빌드 + up 을 수행.
#    (gh 가 있는 web-server 등에서)  gh run rerun <failed-run-id> -R <owner>/<repo>
#    컨테이너/네트워크명만 csc-* 로 교체됨(데이터 없음).
```

---

## 롤백 (문제 발생 시)

기존 `escoa-*` 볼륨을 지우지 않았으므로 즉시 복귀 가능:
```bash
docker compose -f .../csc 스택 down          # csc 스택 내림
git checkout <escoa 리비전>                   # compose name 이 escoa-* 로 복귀
docker compose -f .../escoa 스택 up -d        # 기존 볼륨 그대로 재기동
```

검증이 끝나 escoa 볼륨을 삭제한 뒤에는 롤백 불가: **삭제는 충분히 안정화된 후.**
