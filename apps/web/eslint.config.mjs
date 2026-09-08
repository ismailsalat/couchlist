import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
