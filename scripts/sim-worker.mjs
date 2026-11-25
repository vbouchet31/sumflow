/**
 * Worker thread of the simulator (src/simtools/pool.ts): loads the TypeScript entry given in
 * `workerData.entry` through Vite's module runner, then hands it the message port.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { runnerImport } from 'vite';

const { module } = await runnerImport(workerData.entry, { logLevel: 'error' });
module.serve(parentPort);
