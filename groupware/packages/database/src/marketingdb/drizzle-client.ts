// 싱글톤 클라이언트 (marketingDb, marketingSql). csc-marketing 만 이 DB 를 직접 소유한다.
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const marketingSql = postgres(process.env.MARKETING_DATABASE_URL ?? '');
export const marketingDb = drizzle(marketingSql, { schema });
