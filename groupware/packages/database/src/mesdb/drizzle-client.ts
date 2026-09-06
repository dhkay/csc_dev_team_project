// 싱글톤 클라이언트 (mesDb, mesSql). csc-mes 만 이 DB 를 직접 소유한다.
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const mesSql = postgres(process.env.MES_DATABASE_URL ?? '');
export const mesDb = drizzle(mesSql, { schema });
