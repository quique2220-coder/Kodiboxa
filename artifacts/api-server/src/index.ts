import app from "./app";
import { logger } from "./lib/logger";
import { initializePayments } from "./lib/stripeClient";
import { reconcilePayments } from "./lib/ticketing";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

initializePayments().then(() => {
  logger.info("Stripe synchronization and checkout are ready");
  setInterval(() => { void reconcilePayments().catch(() => logger.error("Payment confirmation retry failed; reservations remain held")); }, 10_000).unref();
}).catch(() => logger.error("Stripe initialization failed; checkout is disabled. Check the Stripe connection."));
