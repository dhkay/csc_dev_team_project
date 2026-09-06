import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const userSql = postgres(process.env.USER_DATABASE_URL ?? '');
export const userDb = drizzle(userSql, { schema });
