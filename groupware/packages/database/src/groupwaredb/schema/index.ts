// 스키마 barrel (csc-groupware 소유, groupwaredb)
// 엔타이틀먼트는 userdb 로 이전됨(.claude/rules/multi-tenancy.md)
// 조직 공용 외부 API 자격증명(암호화 저장): 그룹웨어 도메인 첫 테이블
export * from './api-credential-tables';
export * from './assistant-settings-tables';

// RBFR(역할 기반 배합 비율) 도메인 — rbfr/개발지침/03 DB스키마.md 참고, 테이블은 전부 rbfr_ 접두어
export * from './rbfr-enums';
export * from './rbfr-profile-tables';
export * from './rbfr-ingredient-tables';
export * from './rbfr-formula-tables';
export * from './rbfr-common-tables';
