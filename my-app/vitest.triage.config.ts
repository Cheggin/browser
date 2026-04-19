import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    include: [
      'tests/unit/shell/ChromePages.spec.tsx',
      'tests/unit/triage/source-contracts.test.ts',
    ],
    environment: 'node',
    globals: false,
    alias: {
      electron: path.resolve(__dirname, 'tests/fixtures/electron-mock.ts'),
    },
    reporters: ['verbose'],
  },
  resolve: {
    alias: {
      electron: path.resolve(__dirname, 'tests/fixtures/electron-mock.ts'),
    },
  },
});
