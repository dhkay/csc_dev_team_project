-- 앱별 논리 DB 생성: 멱등(이미 있으면 건너뜀).
--  - 빈 데이터 디렉터리 첫 기동: postgres 이미지가 docker-entrypoint-initdb.d 로 자동 실행.
--  - 기존 볼륨에 새 논리 DB(videomodeldb 등) 추가: initdb 는 재실행되지 않으므로 deploy.sh 의
--    "논리 DB 보장(ensure)" 단계가 매 배포마다 이 파일을 psql 로 재적용해 누락분을 생성한다.
-- Postgres 는 CREATE DATABASE IF NOT EXISTS 가 없어 \gexec 가드로 멱등 처리한다.
SELECT 'CREATE DATABASE file_upload'    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'file_upload')\gexec
SELECT 'CREATE DATABASE groupwaredb'    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'groupwaredb')\gexec
SELECT 'CREATE DATABASE userdb'         WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'userdb')\gexec
SELECT 'CREATE DATABASE controltowerdb' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'controltowerdb')\gexec
SELECT 'CREATE DATABASE marketingdb'    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'marketingdb')\gexec
SELECT 'CREATE DATABASE mesdb'          WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'mesdb')\gexec
SELECT 'CREATE DATABASE videomodeldb'          WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'videomodeldb')\gexec
SELECT 'CREATE DATABASE languagemodeldb'       WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'languagemodeldb')\gexec
SELECT 'CREATE DATABASE crawler'               WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'crawler')\gexec
