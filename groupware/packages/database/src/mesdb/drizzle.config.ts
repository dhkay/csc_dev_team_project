import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/mesdb/schema/index.ts',
  out: './src/mesdb/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.MES_DATABASE_URL ?? '' },
});
