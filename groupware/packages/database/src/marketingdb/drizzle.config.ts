import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/marketingdb/schema/index.ts',
  out: './src/marketingdb/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.MARKETING_DATABASE_URL ?? '' },
});
