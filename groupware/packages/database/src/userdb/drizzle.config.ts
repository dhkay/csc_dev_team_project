import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/userdb/schema/index.ts',
  out: './src/userdb/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.USER_DATABASE_URL ?? '' },
});
