/**
 * Body of a simulator worker thread (`pool.ts`, started by `scripts/sim-worker.mjs`): plays
 * the seed tasks it receives, with its own cost cache, and posts the games back.
 */
import type { MessagePort } from 'node:worker_threads';
import { COST } from './config';
import { CostCache } from './cost';
import { playSeed, type SeedTask } from './run';

export interface WorkerRequest {
  id: number;
  task: SeedTask;
}

export function serve(port: MessagePort): void {
  const cache = new CostCache(COST.margin, COST.cacheNumbers);
  port.on('message', (msg: WorkerRequest | 'close') => {
    if (msg === 'close') {
      port.close();
      return;
    }
    port.postMessage({ id: msg.id, result: playSeed(msg.task, cache) });
  });
  port.postMessage('ready');
}
