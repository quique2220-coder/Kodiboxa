import { Router, type IRouter } from "express";
import { db, users, events, rooms, sessions, registrations, questions, announcements, auditLogs, incidents, ticketOrders } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { GetWorkspaceResponse } from "@workspace/api-zod";
import { currentUser } from "../lib/auth";
import { platformIntegrations, agents } from "../lib/platform";
import { checkoutReady } from "../lib/stripeClient";
import { priceCatalog, listEventCoupons } from "../lib/ticketing";
const router: IRouter = Router();
router.get("/workspace", async (req, res): Promise<void> => {
  const user = await currentUser(req);
  const [allEvents, allSessions, allRegistrations, allRooms, allQuestions, allAnnouncements] = await Promise.all([
    db.select().from(events), db.select().from(sessions), db.select().from(registrations),
    db.select().from(rooms), db.select().from(questions).orderBy(desc(questions.createdAt)),
    db.select().from(announcements).orderBy(desc(announcements.createdAt)),
  ]);
  const admin = user?.role === "admin";
  const ownRegistrations = allRegistrations.filter(r => user && r.userId === user.id);
  const allowed = allEvents.filter(e => !user ? e.example || (!e.isPrivate && e.status !== "draft") : admin || (!e.isPrivate && e.status !== "draft") || ownRegistrations.some(r => r.eventId === e.id) || allSessions.some(s => s.eventId === e.id && s.presenterId === user.id));
  const allowedIds = new Set(allowed.map(e => e.id));
  const [prices, allOrders] = await Promise.all([priceCatalog(), db.select().from(ticketOrders)]);
  const pending = allOrders.filter(o => o.status === "pending");
  const eventRows = allowed.map(e => ({
    ...e,
    sponsorsVisible: !e.isPrivate && e.sponsorsVisible,
    registrations: allRegistrations.filter(r => r.eventId === e.id).length,
    checkedIn: allRegistrations.filter(r => r.eventId === e.id && r.checkedIn).length,
    ticketAmount: e.stripePriceId ? prices.get(e.stripePriceId)?.amount ?? null : 0,
    currency: e.stripePriceId ? prices.get(e.stripePriceId)?.currency ?? "" : "usd",
    reserved: pending.filter(o => o.eventId === e.id).length,
  }));
  const visibleSessions = allSessions.filter(s => allowedIds.has(s.eventId));
  const presenterIds = visibleSessions.map(s => s.presenterId).filter((s): s is string => !!s);
  const allUsers = await db.select().from(users);
  const userRows = allUsers.filter(u => admin || u.id === user?.id || presenterIds.includes(u.id)).map(u => ({
    id: u.id, name: u.name, email: admin || u.id === user?.id ? u.email : "", role: u.role,
  }));
  const response = {
    preview: !user, user: user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null,
    adminConfigured: !!process.env.KODIBOXA_ADMIN_EMAIL || allUsers.some(u => u.role === "admin"),
    users: userRows, events: eventRows, rooms: allRooms.filter(r => allowedIds.has(r.eventId)).map(r => ({
      ...r, registrations: allRegistrations.filter(x => x.roomId === r.id).length,
      checkedIn: admin ? allRegistrations.filter(x => x.roomId === r.id && x.checkedIn).length : undefined,
      reserved: pending.filter(o => o.roomId === r.id).length,
    })),
    sessions: visibleSessions.map(s => ({ ...s, presenterId: s.presenterId ?? "", presenterName: allUsers.find(u => u.id === s.presenterId)?.name || s.speakerName || "Speaker to be announced" })),
    registrations: (admin ? allRegistrations : ownRegistrations).filter(r => allowedIds.has(r.eventId)).map(r => ({ ...r, userId: r.userId ?? "" })),
    questions: allQuestions.filter(q => allowedIds.has(q.eventId)),
    announcements: allAnnouncements.filter(a => allowedIds.has(a.eventId)),
    audit: admin ? await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100) : [],
    incidents: admin ? await db.select().from(incidents).orderBy(desc(incidents.createdAt)) : [],
    integrations: platformIntegrations(admin), agents,
    checkoutReady, emailReady: false,
    coupons: admin ? await listEventCoupons() : [],
    orders: allOrders.filter(o => allowedIds.has(o.eventId) && (admin || o.userId === user?.id)).map(o => ({
      id: o.id, eventId: o.eventId, userId: o.userId, roomId: o.roomId, status: o.status, expiresAt: o.expiresAt,
    })),
    summary: {
      events: eventRows.length, liveEvents: eventRows.filter(e => e.status === "live").length,
      registrations: eventRows.reduce((n, e) => n + e.registrations, 0),
      checkedIn: eventRows.reduce((n, e) => n + e.checkedIn, 0),
      openQuestions: allQuestions.filter(q => allowedIds.has(q.eventId) && q.status === "open").length,
    },
  };
  // Never leak internal account data in anonymous previews.
  if (!user) { response.users = []; response.questions = []; }
  res.json(GetWorkspaceResponse.parse(response));
});
export default router;
