// 싱글톤 클라이언트 (groupwareDb, groupwareSql). csc-groupware 만 이 DB 를 직접 소유한다.
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const groupwareSql = postgres(process.env.GROUPWARE_DATABASE_URL ?? '');
export const groupwareDb = drizzle(groupwareSql, { schema });
