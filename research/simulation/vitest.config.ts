import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['research/simulation/*.run.ts'], testTimeout: 7_200_000, hookTimeout: 120_000, fileParallelism: false, disableConsoleIntercept: true } });
