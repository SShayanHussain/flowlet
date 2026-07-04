import { env } from "./env";
import { buildServer } from "./server";

const app = buildServer();

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then((address) => app.log.info(`Flowlet API listening on ${address}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
