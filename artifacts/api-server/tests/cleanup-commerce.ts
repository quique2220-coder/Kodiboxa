import { readFile, unlink } from "node:fs/promises";
import { clerkClient } from "@clerk/express";
import { db, users, events, rooms, sessions, registrations, ticketOrders, mediaUploads } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { cancelCheckout } from "../src/lib/ticketing";
import { getUncachableStripeClient } from "../src/lib/stripeClient";
import { ObjectStorageService } from "../src/lib/objectStorage";

async function cleanup() {
  if (process.env.NODE_ENV === "production" || !process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")) throw new Error("Fixture cleanup is development-only");
  const fixture = JSON.parse(await readFile("/tmp/event-commerce-fixture.json", "utf8"));
  const accounts = [fixture.admin, fixture.attendee, fixture.other] as Array<{ id: string; email: string }>;
  if (!accounts.every(a => /^commerce-\d+-[a-f0-9]+\+clerk_test@example\.com$/.test(a.email))) throw new Error("Refusing to clean non-fixture accounts");
  const eventIds = [fixture.freeEventId, fixture.paidEventId] as string[];
  const ownEvents = await db.select().from(events).where(inArray(events.id, eventIds));
  if (!ownEvents.every(e => e.title.startsWith("[Verification "))) throw new Error("Refusing to clean non-fixture events");
  const [admin] = await db.select().from(users).where(eq(users.id, fixture.admin.id));
  const orders = await db.select().from(ticketOrders).where(inArray(ticketOrders.eventId, eventIds));
  for (const order of orders.filter(o => o.status === "pending")) await cancelCheckout(admin, order.id);
  const stripe = await getUncachableStripeClient();
  for await (const promo of stripe.promotionCodes.list({ limit: 100 })) {
    if (promo.metadata?.app === "kodiboxa" && eventIds.includes(promo.metadata.eventId)) await stripe.promotionCodes.update(promo.id, { active: false });
  }
  for (const event of ownEvents) if (event.stripeProductId) await stripe.products.update(event.stripeProductId, { active: false });
  const uploads = await db.select().from(mediaUploads).where(inArray(mediaUploads.ownerId, accounts.map(a => a.id)));
  const storage = new ObjectStorageService();
  for (const upload of uploads) {
    try { await (await storage.getObjectEntityFile(upload.objectPath)).delete({ ignoreNotFound: true }); }
    catch (error) { if (error instanceof Error && error.name !== "ObjectNotFoundError") throw error; }
  }
  await db.transaction(async tx => {
    await tx.delete(ticketOrders).where(inArray(ticketOrders.eventId, eventIds));
    await tx.delete(registrations).where(inArray(registrations.eventId, eventIds));
    await tx.delete(sessions).where(inArray(sessions.eventId, eventIds));
    await tx.delete(rooms).where(inArray(rooms.eventId, eventIds));
    await tx.delete(events).where(inArray(events.id, eventIds));
    await tx.delete(mediaUploads).where(inArray(mediaUploads.ownerId, accounts.map(a => a.id)));
    await tx.delete(users).where(inArray(users.id, accounts.map(a => a.id)));
  });
  for (const account of accounts) await clerkClient.users.deleteUser(account.id);
  await unlink("/tmp/event-commerce-fixture.json");
  console.log("Temporary verification accounts, events, reservations and uploads removed; Stripe test products and codes archived.");
}
cleanup().then(() => process.exit(0)).catch(error => { console.error({ cleanupFailed: true, name: error.name }); process.exit(1); });
