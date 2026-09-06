import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/controltowerdb/schema/index.ts',
  out: './src/controltowerdb/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.CONTROLTOWER_DATABASE_URL ?? '' },
});
