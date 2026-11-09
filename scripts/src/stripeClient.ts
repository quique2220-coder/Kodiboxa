import Stripe from "stripe";
import { StripeSync, runMigrations } from "stripe-replit-sync";

async function credentials() {
  const host = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const token = process.env.REPL_IDENTITY ? `repl ${process.env.REPL_IDENTITY}` :
    process.env.WEB_REPL_RENEWAL ? `depl ${process.env.WEB_REPL_RENEWAL}` : null;
  if (!host || !token) throw new Error("Stripe connection is unavailable in this environment");
  const response = await fetch(`https://${host}/api/v2/connection?include_secrets=true&connector_names=stripe`, {
    headers: { Accept: "application/json", X_REPLIT_TOKEN: token },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Unable to authenticate the Stripe connection");
  const data = await response.json() as { items?: Array<{ settings?: { secret?: string; secret_key?: string; webhook_secret?: string } }> };
  const settings = data.items?.[0]?.settings;
  const secretKey = settings?.secret ?? settings?.secret_key;
  if (!secretKey) throw new Error("The connected Stripe account has no secret key");
  return { secretKey, webhookSecret: settings?.webhook_secret };
}

export async function getUncachableStripeClient() {
  const { secretKey } = await credentials();
  return new Stripe(secretKey, { timeout: 15_000, maxNetworkRetries: 1 });
}

let sync: StripeSync | undefined;
export let checkoutReady = false;
export async function getStripeSync() {
  if (!sync) throw new Error("Stripe synchronization is not initialized");
  return sync;
}
export async function initializePayments() {
  if (!process.env.DATABASE_URL) throw new Error("Database required for payments");
  await runMigrations({ databaseUrl: process.env.DATABASE_URL });
  const { secretKey, webhookSecret } = await credentials();
  if (process.env.NODE_ENV !== "production" && !/^([sr]k)_test_/.test(secretKey)) {
    throw new Error("Development checkout requires Stripe test credentials");
  }
  sync = new StripeSync({
    poolConfig: { connectionString: process.env.DATABASE_URL },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? "",
  });
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (!domain) throw new Error("Application domain required for Stripe webhooks");
  await sync.findOrCreateManagedWebhook(`https://${domain}/api/stripe/webhook`);
  await sync.syncBackfill({ object: "all" });
  checkoutReady = true;
}
