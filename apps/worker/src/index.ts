import type { Worker } from "bullmq";
import { prisma } from "@postline/db";
import { log } from "./log";
import { closeQueues, newRedis } from "./queues";
import { startWorkflowWorkers } from "./workers/workflowTriggers";
import { startSyncWorkers } from "./workers/sync";
import { startMetricsWorkers } from "./workers/metrics";
import { startPublishGroupWorker } from "./workers/publishGroup";
import { startPublishPostWorker } from "./workers/publishPost";
import { startDeletePostWorker } from "./workers/deletePost";
import { startAiGenerateWorker } from "./workers/aiGenerate";
import { scheduleMaintenance, startMaintenanceWorker } from "./workers/maintenance";

async function main() {
  const workers: Worker[] = [
    startPublishGroupWorker(),
    startPublishPostWorker(),
    startDeletePostWorker(),
    startAiGenerateWorker(),
    startMaintenanceWorker(),
    ...startWorkflowWorkers(newRedis(), log),
  ];
  const sync = startSyncWorkers(newRedis(), log);
  const metrics = startMetricsWorkers(newRedis(), log);
  workers.push(sync.worker, metrics.worker);
  for (const w of workers) w.on("error", (err) => log.error({ err, queue: w.name }, "worker error"));

  await scheduleMaintenance();
  log.info({ queues: workers.map((w) => w.name) }, "postline worker started");

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, "shutting down: waiting for active jobs");
    const force = setTimeout(() => {
      log.error("shutdown timed out, exiting");
      process.exit(1);
    }, 30_000);
    force.unref();
    try {
      await Promise.allSettled(workers.map((w) => w.close()));
      await Promise.allSettled([sync.queue.close(), metrics.queue.close()]);
      await closeQueues();
      await prisma.$disconnect();
      log.info("bye");
      process.exit(0);
    } catch (err) {
      log.error({ err }, "error during shutdown");
      process.exit(1);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

process.on("unhandledRejection", (err) => log.error({ err }, "unhandled rejection"));

main().catch((err) => {
  log.fatal({ err }, "worker failed to start");
  process.exit(1);
});
