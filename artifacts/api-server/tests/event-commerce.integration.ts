import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/express";
import { db, users, events, rooms, registrations, ticketOrders } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { execute } from "../src/lib/commands";
import { initializePayments, getUncachableStripeClient } from "../src/lib/stripeClient";
import { startCheckout, cancelCheckout, listEventCoupons, priceCatalog } from "../src/lib/ticketing";

// Explicit opt-in, development-only integration verification; never run in live mode.
async function main() {
  if (process.env.NODE_ENV === "production" || !process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")) throw new Error("Development test identities are required");
  await initializePayments(); // Also refuses non-test Stripe credentials.
  const key = randomUUID().slice(0, 8);
  const accounts = [];
  for (const role of ["admin", "participant", "participant"] as const) {
    const email = `commerce-${accounts.length}-${key}+clerk_test@example.com`;
    const identity = await clerkClient.users.createUser({
      emailAddress: [email], password: "VerificationOnly-EventDesk-2026!",
      firstName: "Commerce", lastName: role === "admin" ? "Verification Admin" : `Verification Attendee ${accounts.length}`,
      skipPasswordChecks: true,
    });
    const [user] = await db.insert(users).values({ id: identity.id, name: `Verification ${role} ${accounts.length}`, email, role, bootstrapGranted: "yes" }).returning();
    accounts.push(user);
  }
  const [admin, attendee, other] = accounts;
  const startsAt = new Date(Date.now() + 86400000).toISOString();
  const endsAt = new Date(Date.now() + 90000000).toISOString();
  const free = await execute(admin, { action: "create_event", title: `[Verification ${key}] Free room reservations`, description: "Temporary verification event", startsAt, endsAt, capacity: 2, isPrivate: false, status: "upcoming", ticketAmount: 0, roomPlans: [{ name: "Schedule room", capacity: 2, sessions: [{ title: "Welcome", presenterName: `Free guest ${key}`, startsAt, endsAt }] }] });
  const a = await execute(admin, { action: "create_room", eventId: free.id, name: "Salon Alpha", capacity: 1 });
  const b = await execute(admin, { action: "create_room", eventId: free.id, name: "Salon Beta", capacity: 1 });
  await assert.rejects(execute(attendee, { action: "register", eventId: free.id }), /Choose a room/);
  await execute(attendee, { action: "register", eventId: free.id, roomId: a.id });
  await assert.rejects(execute(other, { action: "register", eventId: free.id, roomId: a.id }), /room is full/);
  await execute(other, { action: "register", eventId: free.id, roomId: b.id });
  await assert.rejects(execute(attendee, { action: "reserve_room", eventId: free.id, roomId: b.id }), /room is full/);
  const freeRegs = await db.select().from(registrations).where(eq(registrations.eventId, free.id));
  assert.equal(freeRegs.length, 2);
  assert.equal(freeRegs.filter(r => r.roomId === a.id).length, 1);
  assert.equal(freeRegs.filter(r => r.roomId === b.id).length, 1);
  console.log("PASS: room selection, per-room capacity, duplicate prevention and persisted registrations");

  const paid = await execute(admin, { action: "create_event", title: `[Verification ${key}] Paid event desk`, headline: "Meet the people behind the platform", description: "Temporary Stripe test-mode event", presenterName: "Alex Rivers", presenterBio: "A presenter profile editable by the organizer.", accentColor: "#7559e8", startsAt, endsAt, capacity: 3, isPrivate: false, status: "upcoming", ticketAmount: 1000, currency: "usd", roomPlans: [{ name: "Schedule room", capacity: 3, sessions: [{ title: "Welcome", presenterName: `Paid guest ${key}`, startsAt, endsAt }] }] });
  await execute(admin, { action: "update_event", id: paid.id, ticketAmount: 1200, currency: "usd" });
  const salon = await execute(admin, { action: "create_room", eventId: paid.id, name: "Main Salon", capacity: 2 });
  const code = `CHECK${key.toUpperCase()}`;
  const coupon = await execute(admin, { action: "create_coupon", eventId: paid.id, code, percentOff: 50, maxRedemptions: 1, expiresAt: new Date(Date.now() + 86400000).toISOString() });
  const coupons = await listEventCoupons();
  assert.equal(coupons.find(c => c.id === coupon.id)?.percentOff, 50);
  await assert.rejects(execute(attendee, { action: "register", eventId: paid.id, roomId: salon.id }), /requires Stripe checkout/);
  await assert.rejects(startCheckout(attendee, { eventId: paid.id, roomId: salon.id, couponCode: "NOT-A-REAL-CODE" }), /invalid/);
  const checkout = await startCheckout(attendee, { eventId: paid.id, roomId: salon.id, couponCode: code });
  const repeated = await startCheckout(attendee, { eventId: paid.id, roomId: salon.id });
  assert.equal(checkout.id, repeated.id);
  const [order] = await db.select().from(ticketOrders).where(eq(ticketOrders.id, checkout.id));
  const stripe = await getUncachableStripeClient();
  const session = await stripe.checkout.sessions.retrieve(order.checkoutSessionId!);
  assert.equal(session.livemode, false);
  assert.equal(session.amount_total, 600);
  assert.equal((await db.select().from(registrations).where(eq(registrations.eventId, paid.id))).length, 0);
  await assert.rejects(cancelCheckout(other, checkout.id), /not found/);
  await cancelCheckout(attendee, checkout.id);
  const [cancelled] = await db.select().from(ticketOrders).where(eq(ticketOrders.id, checkout.id));
  assert.equal(cancelled.status, "expired");
  const [paidEvent] = await db.select().from(events).where(eq(events.id, paid.id));
  assert.equal((await priceCatalog()).get(paidEvent.stripePriceId)?.amount, 1200);
  assert.equal(paidEvent.headline, "Meet the people behind the platform");
  await execute(admin, { action: "toggle_coupon", id: coupon.id, active: false });
  await assert.rejects(startCheckout(attendee, { eventId: paid.id, roomId: salon.id, couponCode: code }), /invalid/);
  await execute(admin, { action: "toggle_coupon", id: coupon.id, active: true });
  console.log("PASS: real Stripe test price updates, 50% coupon, idempotent checkout, no premature pass, cancellation ownership and coupon activation");
  await writeFile("/tmp/event-commerce-fixture.json", JSON.stringify({
    admin: { id: admin.id, email: admin.email }, attendee: { id: attendee.id, email: attendee.email },
    other: { id: other.id, email: other.email }, freeEventId: free.id, paidEventId: paid.id, roomId: salon.id, couponCode: code,
  }));
  console.log(JSON.stringify({ fixturePath: "/tmp/event-commerce-fixture.json", adminEmail: admin.email, attendeeEmail: attendee.email, paidEventId: paid.id, couponCode: code, expectedPrice: "$12.00", expectedDiscountedPrice: "$6.00" }));
}
main().then(() => process.exit(0)).catch(error => { console.error({ name: error.name, message: String(error.message).replace(/[sr]k_(test|live)_[A-Za-z0-9]+/g, "[redacted]"), code: error.code }); process.exit(1); });
