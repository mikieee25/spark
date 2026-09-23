import { createServer } from "node:http";
import { monitorEventLoopDelay } from "node:perf_hooks";
import next from "next";

if (!process.env.UV_THREADPOOL_SIZE) process.env.UV_THREADPOOL_SIZE = "16";

const development = process.env.NODE_ENV !== "production";
const hostname = process.env.SPARK_HOST || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "3000", 10);
const app = next({ dev: development, hostname, port });
const handle = app.getRequestHandler();

const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();
const publishEventLoopSample = () => {
  globalThis.__SPARK_RUNTIME_PERFORMANCE__ = {
    measuredAt: Date.now(),
    eventLoopMeanMs: Number((eventLoop.mean / 1e6).toFixed(1)),
    eventLoopP95Ms: Number((eventLoop.percentile(95) / 1e6).toFixed(1)),
    eventLoopMaxMs: Number((eventLoop.max / 1e6).toFixed(1)),
  };
  eventLoop.reset();
};
const eventLoopTimer = setInterval(publishEventLoopSample, 1_000);
eventLoopTimer.unref();

await app.prepare();
const server = createServer((request, response) => handle(request, response));
server.on("error", (error) => {
  console.error("SPARK server failed", error);
  process.exitCode = 1;
});
server.listen(port, hostname, () => {
  console.log(`DOE SPARK listening on http://${hostname}:${port}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}; closing SPARK.`);
  clearInterval(eventLoopTimer);
  eventLoop.disable();
  server.close(() => process.exit(0));
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
