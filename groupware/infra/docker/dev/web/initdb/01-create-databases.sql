-- dev web-server postgres 초기화: 서비스별 논리 DB 생성 (최초 1회, 빈 볼륨일 때만 실행).
-- staging/prod 와 동일 구성 + videomodeldb(video-model SSoT) 추가.
CREATE DATABASE file_upload;
CREATE DATABASE groupwaredb;
CREATE DATABASE userdb;
CREATE DATABASE controltowerdb;
CREATE DATABASE marketingdb;
CREATE DATABASE mesdb;
CREATE DATABASE videomodeldb;
CREATE DATABASE languagemodeldb;
CREATE DATABASE crawler;
