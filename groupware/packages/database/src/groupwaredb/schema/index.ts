// 스키마 barrel (csc-groupware 소유, groupwaredb)
// 엔타이틀먼트는 userdb 로 이전됨(.claude/rules/multi-tenancy.md)
// 조직 공용 외부 API 자격증명(암호화 저장): 그룹웨어 도메인 첫 테이블
export * from './api-credential-tables';
export * from './assistant-settings-tables';
