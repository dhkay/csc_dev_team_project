import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/groupwaredb/schema/index.ts',
  out: './src/groupwaredb/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.GROUPWARE_DATABASE_URL ?? '' },
});
