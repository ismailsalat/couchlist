import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:5432/couchlist',
  },
  strict: true,
  verbose: true,
});
