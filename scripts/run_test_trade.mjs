// npm run test:trade: bundles scripts/test_trade.ts with the NFL edition's import.meta.env and runs it
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

mkdirSync('node_modules/.tmp', { recursive: true });
await build({
  entryPoints: ['scripts/test_trade.ts'], bundle: true, platform: 'node', outfile: 'node_modules/.tmp/trade.cjs', logLevel: 'error',
  alias: { '@': './src' },
  define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/', VITE_EDITION: 'nfl', DEV: false, MODE: 'test' }) },
});
process.exit(spawnSync('node', ['node_modules/.tmp/trade.cjs'], { stdio: 'inherit' }).status ?? 1);
