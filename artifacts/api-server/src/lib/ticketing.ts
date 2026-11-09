import { randomUUID, randomBytes } from "node:crypto";
import { db, events, registrations, ticketOrders, rooms, users, auditLogs } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { fail } from "./auth";
import { checkoutReady, getUncachableStripeClient, getStripeSync } from "./stripeClient";
import { StartEventCheckoutBody } from "@workspace/api-zod";
import { withTelemetryOperation } from "./telemetry";

type CheckoutInput = ReturnType<typeof StartEventCheckoutBody.parse>;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type EventRow = typeof events.$inferSelect;
type Account = typeof users.$inferSelect;
const now = () => new Date().toISOString();
export const ticketLock = sql`select pg_advisory_xact_lock(47018031)`;

export async function assertSeat(tx: Tx, event: EventRow, roomId?: string | null, ignoreRegistration?: string, ignoreOrder?: string) {
  const eventRooms = await tx.select().from(rooms).where(eq(rooms.eventId, event.id));
  if (eventRooms.length && !roomId) fail(400, "Choose a room for your reservation");
  const room = eventRooms.find(r => r.id === roomId);
  if (roomId && !room) fail(400, "Choose a room belonging to this event");
  const regs = (await tx.select().from(registrations).where(eq(registrations.eventId, event.id))).filter(r => r.id !== ignoreRegistration);
  const holds = (await tx.select().from(ticketOrders).where(and(eq(ticketOrders.eventId, event.id), eq(ticketOrders.status, "pending")))).filter(o => o.id !== ignoreOrder);
  if (!ignoreRegistration && regs.length + holds.length >= event.capacity) fail(409, "No event seats are available; some may be held by pending checkouts");
  if (room && regs.filter(r => r.roomId === room.id).length + holds.filter(o => o.roomId === room.id).length >= room.capacity) fail(409, "This room is full; choose another room");
  return room?.id ?? null;
}

export async function updateEventPrice(eventId: string, title: string, old: EventRow | undefined, amount?: number, currency = "usd") {
  if (amount === undefined) return { stripeProductId: old?.stripeProductId ?? "", stripePriceId: old?.stripePriceId ?? "" };
  if (amount === 0) return { stripeProductId: old?.stripeProductId ?? "", stripePriceId: "" };
  if (amount < 100) fail(400, "Paid admission must be at least 1.00 in the selected currency");
  if (!checkoutReady) fail(503, "Stripe is not ready; paid admission cannot be saved yet");
  const stripe = await getUncachableStripeClient();
  // Event tables store relationships, never a duplicate Stripe price catalog.
  let productId = old?.stripeProductId;
  if (!productId) productId = (await stripe.products.create({ name: title, metadata: { eventId, app: "kodiboxa" } }, { idempotencyKey: `event-product-${eventId}` })).id;
  else await stripe.products.update(productId, { name: title });
  if (old?.stripePriceId) {
    const current = await stripe.prices.retrieve(old.stripePriceId);
    if (current.active && current.unit_amount === amount && current.currency === currency) return { stripeProductId: productId, stripePriceId: current.id };
  }
  const price = await stripe.prices.create({ product: productId, unit_amount: amount, currency }, { idempotencyKey: `event-price-${eventId}-${amount}-${currency}` });
  await (await getStripeSync()).syncBackfill({ object: "price" });
  return { stripeProductId: productId, stripePriceId: price.id };
}

export async function priceCatalog() {
  if (!checkoutReady) return new Map<string, { amount: number | null; currency: string }>();
  const result = await db.execute(sql`select id, unit_amount, currency from stripe.prices`);
  return new Map(result.rows.map(p => [String(p.id), { amount: p.unit_amount == null ? null : Number(p.unit_amount), currency: String(p.currency) }]));
}

type CouponView = { id: string; eventId: string; code: string; percentOff: number; redemptions: number; maxRedemptions: number | null; expiresAt: string | null; active: boolean };
let couponCache: { expires: number; values: CouponView[] } = { expires: 0, values: [] };
export function clearCouponCache() { couponCache.expires = 0; }
export async function listEventCoupons() {
  if (!checkoutReady) return [];
  if (couponCache.expires > Date.now()) return couponCache.values;
  const stripe = await getUncachableStripeClient();
  const values: CouponView[] = [];
  for await (const promo of stripe.promotionCodes.list({ limit: 100, expand: ["data.promotion.coupon"] })) {
    if (promo.metadata?.app !== "kodiboxa" || !promo.metadata.eventId) continue;
    const linked = promo.promotion.coupon;
    const coupon = typeof linked === "string" ? await stripe.coupons.retrieve(linked) : linked;
    if (!coupon || "deleted" in coupon) continue;
    values.push({ id: promo.id, eventId: promo.metadata.eventId, code: promo.code, percentOff: coupon.percent_off ?? 0,
      redemptions: promo.times_redeemed, maxRedemptions: promo.max_redemptions, expiresAt: promo.expires_at ? new Date(promo.expires_at * 1000).toISOString() : null, active: promo.active });
  }
  couponCache = { expires: Date.now() + 20_000, values };
  return values;
}

export async function createEventCoupon(event: EventRow, input: { code?: string; percentOff?: number; maxRedemptions?: number; expiresAt?: string }) {
  if (!event.stripeProductId || !event.stripePriceId) fail(400, "Save this event with paid admission before creating coupons");
  if (!input.code || !input.percentOff) fail(400, "Code and percentage discount are required");
  const expiresAt = input.expiresAt ? Math.floor(new Date(input.expiresAt).getTime() / 1000) : undefined;
  if (expiresAt !== undefined && (!Number.isFinite(expiresAt) || expiresAt <= Date.now() / 1000)) fail(400, "Coupon expiry must be in the future");
  const stripe = await getUncachableStripeClient();
  const existing = await stripe.promotionCodes.list({ code: input.code.toUpperCase(), active: true, limit: 1 });
  if (existing.data.length) fail(409, "An active coupon already uses this code");
  const coupon = await stripe.coupons.create({
    duration: "once", percent_off: input.percentOff, applies_to: { products: [event.stripeProductId] },
    metadata: { app: "kodiboxa", eventId: event.id },
  });
  const promo = await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: coupon.id }, code: input.code.toUpperCase(),
    max_redemptions: input.maxRedemptions, expires_at: expiresAt, metadata: { app: "kodiboxa", eventId: event.id },
  });
  clearCouponCache();
  return promo.id;
}

export async function toggleEventCoupon(id: string, active: boolean) {
  const stripe = await getUncachableStripeClient();
  const promo = await stripe.promotionCodes.retrieve(id);
  if (promo.metadata?.app !== "kodiboxa") fail(404, "Event coupon not found");
  if (active && ((promo.expires_at && promo.expires_at <= Date.now() / 1000) || (promo.max_redemptions && promo.times_redeemed >= promo.max_redemptions))) {
    fail(409, "This coupon is expired or fully redeemed; create a new code instead");
  }
  await stripe.promotionCodes.update(id, { active });
  clearCouponCache();
}

export function startCheckout(user: Account, input: CheckoutInput) {
  return withTelemetryOperation("payment.checkout", () => startCheckoutInternal(user, input));
}
async function startCheckoutInternal(user: Account, input: CheckoutInput) {
  if (!checkoutReady) fail(503, "Stripe checkout is unavailable");
  const stripe = await getUncachableStripeClient();
  let promoId: string | undefined;
  if (input.couponCode?.trim()) {
    const matches = await stripe.promotionCodes.list({ code: input.couponCode.trim(), active: true, limit: 100 });
    const promo = matches.data.find(p => p.metadata?.eventId === input.eventId && p.metadata?.app === "kodiboxa");
    if (!promo) fail(400, "This coupon is invalid, expired or belongs to another event");
    promoId = promo.id;
  }
  const order = await withTelemetryOperation("database.transaction", () => db.transaction(async tx => {
    await tx.execute(ticketLock);
    const [event] = await tx.select().from(events).where(eq(events.id, input.eventId));
    if (!event) fail(404, "Event not found");
    if (event.status === "completed" || event.status === "draft") fail(409, "This event is not accepting registrations");
    if (event.isPrivate && user.role !== "admin") fail(403, "This private event requires an administrator invitation");
    if (!event.stripePriceId) fail(400, "This event is free; use regular registration");
    const regs = await tx.select().from(registrations).where(and(eq(registrations.eventId, event.id), eq(registrations.email, user.email)));
    if (regs.length) fail(409, "You are already registered");
    const [pending] = await tx.select().from(ticketOrders).where(and(eq(ticketOrders.eventId, event.id), eq(ticketOrders.userId, user.id), eq(ticketOrders.status, "pending")));
    if (pending) return { order: pending, event };
    const roomId = await assertSeat(tx, event, input.roomId);
    const [created] = await tx.insert(ticketOrders).values({
      id: randomUUID(), eventId: event.id, userId: user.id, roomId, createdAt: now(),
      stripePriceId: event.stripePriceId, promotionCodeId: promoId ?? null,
      expiresAt: new Date(Date.now() + 31 * 60_000).toISOString(),
    }).returning();
    return { order: created, event };
  }));
  const { order: hold, event } = order;
  if (hold.checkoutSessionId) {
    const session = await stripe.checkout.sessions.retrieve(hold.checkoutSessionId);
    if (session.status === "open" && session.url) return { id: hold.id, url: session.url };
    await settleOrder(hold, session);
    fail(409, session.status === "complete" ? "Payment received; refresh to see your registration" : "Checkout expired; please try again");
  }
  try {
    const session = await createStripeCheckout(stripe, hold, user);
    await db.update(ticketOrders).set({ checkoutSessionId: session.id }).where(eq(ticketOrders.id, hold.id));
    if (!session.url) {
      await settleOrder(hold, session);
      fail(409, "This checkout is already closed; refresh your registration");
    }
    return { id: hold.id, url: session.url };
  } catch (error) {
    // If Stripe may have created a session despite a network timeout, recover
    // via the same idempotency key on retry; do not release its inventory early.
    if (error instanceof Error && error.name === "StripeInvalidRequestError") {
      await db.update(ticketOrders).set({ status: "cancelled" }).where(and(eq(ticketOrders.id, hold.id), eq(ticketOrders.status, "pending")));
      fail(400, "Stripe could not accept this checkout. Check the coupon, price and event availability.");
    }
    throw error;
  }
}

function createStripeCheckout(stripe: Stripe, hold: typeof ticketOrders.$inferSelect, user: Account) {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (!domain) fail(503, "Application URL is unavailable");
  const base = `https://${domain}/events/${encodeURIComponent(hold.eventId)}`;
  return withTelemetryOperation("stripe.checkout", () => stripe.checkout.sessions.create({
    mode: "payment", payment_method_types: ["card"], line_items: [{ price: hold.stripePriceId, quantity: 1 }],
    customer_email: user.email, client_reference_id: hold.id,
    metadata: { orderId: hold.id, eventId: hold.eventId, userId: user.id, app: "kodiboxa" },
    discounts: hold.promotionCodeId ? [{ promotion_code: hold.promotionCodeId }] : undefined,
    expires_at: Math.floor(new Date(hold.expiresAt).getTime() / 1000),
    success_url: `${base}?checkout=success`, cancel_url: `${base}?checkout=cancelled`,
  }, { idempotencyKey: `event-checkout-${hold.id}` }));
}

async function settleOrder(order: typeof ticketOrders.$inferSelect, session: Stripe.Checkout.Session) {
  return withTelemetryOperation("payment.settlement", () => settleOrderInternal(order, session));
}
async function settleOrderInternal(order: typeof ticketOrders.$inferSelect, session: Stripe.Checkout.Session) {
  if (session.metadata?.orderId !== order.id || session.metadata?.eventId !== order.eventId || session.metadata?.userId !== order.userId) fail(409, "Payment metadata does not match this reservation");
  await db.transaction(async tx => {
    await tx.execute(ticketLock);
    const [current] = await tx.select().from(ticketOrders).where(eq(ticketOrders.id, order.id));
    if (!current || current.status !== "pending") return;
    if (session.status === "expired") {
      await tx.update(ticketOrders).set({ status: "expired" }).where(eq(ticketOrders.id, order.id));
      return;
    }
    if (session.status !== "complete" || !["paid", "no_payment_required"].includes(session.payment_status)) return;
    const [user] = await tx.select().from(users).where(eq(users.id, order.userId));
    if (!user) fail(409, "Payment account is unavailable");
    const [existing] = await tx.select().from(registrations).where(and(eq(registrations.eventId, order.eventId), eq(registrations.email, user.email)));
    if (existing) fail(409, "Payment needs administrator review: account already registered");
    const id = randomUUID();
    await tx.insert(registrations).values({
      id, eventId: order.eventId, userId: user.id, name: user.name, email: user.email, roomId: order.roomId,
      paymentStatus: "paid", passCode: `KBX-${randomBytes(24).toString("hex")}`, createdAt: now(),
    });
    await tx.update(ticketOrders).set({ status: "paid", registrationId: id }).where(eq(ticketOrders.id, order.id));
    await tx.insert(auditLogs).values({ id: randomUUID(), actor: user.name, action: "payment_confirmed", detail: `Confirmed Stripe payment for event ${order.eventId}`, createdAt: now() });
  });
}

let reconciling = false;
export async function reconcilePayments() {
  if (!checkoutReady || reconciling) return;
  reconciling = true;
  try {
    const pending = await db.select().from(ticketOrders).where(eq(ticketOrders.status, "pending"));
    if (!pending.length) return;
    const stripe = await getUncachableStripeClient();
    for (const order of pending) {
      try {
        if (order.checkoutSessionId) {
          await settleOrder(order, await stripe.checkout.sessions.retrieve(order.checkoutSessionId));
        } else {
          const [user] = await db.select().from(users).where(eq(users.id, order.userId));
          if (!user) continue;
          // Recover the original checkout after an interrupted API response.
          // Price, promotion and expiry are frozen to keep retries idempotent.
          const session = await createStripeCheckout(stripe, order, user);
          await db.update(ticketOrders).set({ checkoutSessionId: session.id }).where(eq(ticketOrders.id, order.id));
          await settleOrder(order, await stripe.checkout.sessions.retrieve(session.id));
        }
      } catch (error) {
        if (!order.checkoutSessionId && error instanceof Error && error.name === "StripeInvalidRequestError") {
          await db.update(ticketOrders).set({ status: "expired" }).where(and(eq(ticketOrders.id, order.id), eq(ticketOrders.status, "pending")));
        } else {
          // Isolate failures so one unavailable payment does not stop others.
          console.error("A pending event payment could not be reconciled; its seat remains held");
        }
      }
    }
  } finally { reconciling = false; }
}

export async function cancelCheckout(user: Account, id: string) {
  const [order] = await db.select().from(ticketOrders).where(eq(ticketOrders.id, id));
  if (!order || (order.userId !== user.id && user.role !== "admin")) fail(404, "Checkout not found");
  if (order.status !== "pending") return { id, message: `Checkout is ${order.status}` };
  if (!order.checkoutSessionId) fail(409, "Checkout is still being created; retry shortly");
  const stripe = await getUncachableStripeClient();
  let session = await stripe.checkout.sessions.retrieve(order.checkoutSessionId);
  if (session.status === "open") {
    try { session = await stripe.checkout.sessions.expire(session.id); }
    catch {
      session = await stripe.checkout.sessions.retrieve(session.id);
      if (session.status === "open") fail(409, "Checkout could not be cancelled; retry shortly");
    }
  }
  await settleOrder(order, session);
  return { id, message: session.status === "complete" ? "Payment already completed; your pass is being confirmed" : "Checkout cancelled; held seat released" };
}
