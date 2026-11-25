/**
 * Worker threads playing seed tasks in parallel (`run.ts`). Each worker keeps its own cost
 * cache; games are deterministic, so the result does not depend on the number of workers
 * nor on which worker plays which seed. Tasks are handed out in order, results kept in order.
 */
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { SeedResult, SeedRunner, SeedTask } from './run';
import type { WorkerRequest } from './worker';

/** Default number of workers: the machine's cores, at most 8. */
export function defaultWorkers(): number {
  return Math.max(1, Math.min(8, availableParallelism()));
}

export class WorkerPool {
  private constructor(private readonly workers: Worker[]) {}

  /** Start `count` workers and wait until each one has loaded the simulator. */
  static async start(count: number): Promise<WorkerPool> {
    const script = fileURLToPath(new URL('../../scripts/sim-worker.mjs', import.meta.url));
    const entry = fileURLToPath(new URL('./worker.ts', import.meta.url));
    const workers = Array.from(
      { length: count },
      () => new Worker(script, { workerData: { entry } }),
    );
    await Promise.all(
      workers.map(
        (w) =>
          new Promise<void>((resolve, reject) => {
            w.once('message', () => resolve());
            w.once('error', reject);
          }),
      ),
    );
    return new WorkerPool(workers);
  }

  /** Play `tasks`, each worker taking the next task as soon as it is free. */
  readonly run: SeedRunner = (tasks: readonly SeedTask[]) =>
    new Promise<SeedResult[]>((resolve, reject) => {
      const results: SeedResult[] = new Array<SeedResult>(tasks.length);
      let next = 0;
      let done = 0;
      if (tasks.length === 0) {
        resolve(results);
        return;
      }
      const feed = (w: Worker): void => {
        const id = next++;
        const task = tasks[id];
        if (!task) return;
        const req: WorkerRequest = { id, task };
        w.postMessage(req);
      };
      const cleanups: (() => void)[] = [];
      for (const w of this.workers) {
        const onMessage = (msg: { id: number; result: SeedResult }): void => {
          results[msg.id] = msg.result;
          done++;
          if (done === tasks.length) {
            for (const c of cleanups) c();
            resolve(results);
          } else feed(w);
        };
        const onError = (e: Error): void => {
          for (const c of cleanups) c();
          reject(e);
        };
        w.on('message', onMessage);
        w.on('error', onError);
        cleanups.push(() => {
          w.off('message', onMessage);
          w.off('error', onError);
        });
        feed(w);
      }
    });

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}
