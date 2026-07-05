import { env } from "./env";
import { db } from "./db";
import { makeQueues } from "./queues";
import { buildServer } from "./server";

const { queues, close: closeQueues } = makeQueues(env.REDIS_URL, env.QUEUE_PREFIX);
const app = buildServer({ db, queues });

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then((address) => app.log.info(`Flowlet API listening on ${address}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

async function shutdown() {
  await app.close();
  await closeQueues();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
