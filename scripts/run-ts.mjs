/**
 * Run a TypeScript entry of the repository with Node, through Vite's module runner (no extra
 * dependency): `node scripts/run-ts.mjs <entry.ts> [args...]`. The entry must export
 * `main(args: string[]): Promise<number>`; its result is the process exit code.
 */
import { resolve } from 'node:path';
import { runnerImport } from 'vite';

const [entry, ...args] = process.argv.slice(2);
if (!entry) {
  process.stderr.write('usage: node scripts/run-ts.mjs <entry.ts> [args...]\n');
  process.exit(2);
}
const { module } = await runnerImport(resolve(entry), { logLevel: 'error' });
process.exitCode = await module.main(args);
