// 공유 DB 패키지 barrel. DB 1개 = 디렉토리 1개 (서버별 소유권 분리)
export * as groupwaredb from './groupwaredb';     // csc-groupware 소유
export * as userdb from './userdb';               // user 소유
export * as controltowerdb from './controltowerdb'; // csc-control-tower 소유
export * as marketingdb from './marketingdb';       // csc-marketing 소유
export * as mesdb from './mesdb';                   // csc-mes 소유
