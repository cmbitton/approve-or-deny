// Worker thread for build-share.ts: renders a batch of preview images to the cache.
import { writeFileSync } from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';
import { type CardInput, renderCard } from './card.ts';

for (const job of workerData as (CardInput & { out: string })[]) {
  writeFileSync(job.out, await renderCard(job));
  parentPort!.postMessage(1);
}
