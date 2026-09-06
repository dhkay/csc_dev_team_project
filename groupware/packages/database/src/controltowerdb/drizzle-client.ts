// 싱글톤 클라이언트 (controlTowerDb, controlTowerSql). csc-control-tower 만 이 DB 를 직접 소유한다.
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const controlTowerSql = postgres(process.env.CONTROLTOWER_DATABASE_URL ?? '');
export const controlTowerDb = drizzle(controlTowerSql, { schema });
