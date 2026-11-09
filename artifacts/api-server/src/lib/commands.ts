import { randomUUID, randomBytes } from "node:crypto";
import { db, users, events, rooms, sessions, registrations, questions, announcements, auditLogs, checkins, incidents, mediaUploads, ticketOrders, roomVisits } from "@workspace/db";
import { eq, and, ne, sql } from "drizzle-orm";
import { ExecuteCommandBody } from "@workspace/api-zod";
import { fail } from "./auth";
import { measureDemoService } from "./platform";
import { assertSeat, updateEventPrice, createEventCoupon, toggleEventCoupon } from "./ticketing";
import { validateRoomPlans, insertRoomPlans } from "./room-planning";
import { changeRoomAttendance, leaveRoom } from "./room-attendance";
import { getLiveKitStatus } from "./livekit";
type Input = ReturnType<typeof ExecuteCommandBody.parse>;
type User = typeof users.$inferSelect;
const stamp = () => new Date().toISOString();
function required(value: string | undefined, field: string) {
  if (!value?.trim()) fail(400, `${field} is required`);
  return value.trim();
}
function dates(start: string | undefined, end: string | undefined) {
  const a = new Date(required(start, "Start time")), b = new Date(required(end, "End time"));
  if (!Number.isFinite(+a) || !Number.isFinite(+b) || b <= a) fail(400, "End time must be after start time");
  return { startsAt: a.toISOString(), endsAt: b.toISOString() };
}
export async function execute(user: User, c: Input) {
  const participantActions = ["register", "reserve_room", "ask_question", "room_check_in", "room_check_out"];
  const presenterActions = ["start_session", "end_session", "answer_question", "post_announcement"];
  if (user.role !== "admin" && !participantActions.includes(c.action) && !(user.role === "presenter" && presenterActions.includes(c.action))) fail(403, "Administrator permission is required.");
  if (c.action === "start_session") {
    const liveKit = getLiveKitStatus();
    if (!liveKit.configured) fail(503, liveKit.setupMessage);
  }
  return db.transaction(async tx => {
    // Serialize writes which depend on counts, schedules or approval state.
    await tx.execute(sql`select pg_advisory_xact_lock(47018031)`);
    let id = c.id ?? randomUUID();
    let detail = "";
    const eventFor = async (eventId?: string) => {
      const [event] = await tx.select().from(events).where(eq(events.id, required(eventId, "Event")));
      if (!event) fail(404, "Event not found");
      return event;
    };
    const sessionFor = async (sessionId?: string) => {
      const [session] = await tx.select().from(sessions).where(eq(sessions.id, required(sessionId, "Session")));
      if (!session) fail(404, "Session not found");
      return session;
    };
    const canManageSession = (s: typeof sessions.$inferSelect) => {
      if (user.role !== "admin" && s.presenterId !== user.id) fail(403, "This session is not assigned to you");
    };
    switch (c.action) {
      case "create_event":
      case "update_event": {
        const old = c.action === "update_event" ? await eventFor(c.id) : undefined;
        const type = c.type ?? old?.type ?? "meeting";
        const isPrivate = c.isPrivate ?? old?.isPrivate ?? type === "meeting";
        const interval = dates(c.startsAt ?? old?.startsAt, c.endsAt ?? old?.endsAt);
        const capacity = c.capacity ?? old?.capacity ?? 100;
        if (!old && !c.roomPlans?.length) fail(400, "Specify the number of rooms and a schedule with speakers for every room");
        if (old && c.roomPlans) fail(400, "Manage existing rooms and sessions separately; event edits never replace attendance history");
        const plannedRooms = !old && c.roomPlans ? await validateRoomPlans(tx, c.roomPlans, { ...interval, capacity }) : undefined;
        if (old) {
          const regs = await tx.select().from(registrations).where(eq(registrations.eventId, old.id));
          const held = await tx.select().from(ticketOrders).where(and(eq(ticketOrders.eventId, old.id), eq(ticketOrders.status, "pending")));
          if (regs.length + held.length > capacity) fail(409, "Capacity cannot be lower than registered and held seats");
          const existingRooms = await tx.select().from(rooms).where(eq(rooms.eventId, old.id));
          if (existingRooms.some(r => r.capacity > capacity)) fail(409, "Event capacity cannot be smaller than an existing room");
          const scheduled = await tx.select().from(sessions).where(eq(sessions.eventId, old.id));
          if (scheduled.some(s => s.startsAt < interval.startsAt || s.endsAt > interval.endsAt)) fail(409, "Event times must include all scheduled sessions");
        }
        id = old?.id ?? randomUUID();
        for (const path of [c.bannerPath, c.presenterPhotoPath].filter(Boolean)) {
          const [asset] = await tx.select().from(mediaUploads).where(and(eq(mediaUploads.objectPath, path!), eq(mediaUploads.status, "ready")));
          if (!asset) fail(400, "Upload and complete the PNG image before saving");
        }
        const stripeFields = await updateEventPrice(id, required(c.title ?? old?.title, "Title"), old, c.ticketAmount, c.currency);
        const values = {
          title: required(c.title ?? old?.title, "Title"), description: c.description ?? old?.description ?? "", type,
          status: c.status ?? old?.status ?? "upcoming", location: c.location ?? old?.location ?? "",
          ...interval, capacity, isPrivate,
          sponsorsVisible: !isPrivate && (c.sponsorsVisible ?? old?.sponsorsVisible ?? false),
          headline: c.headline ?? old?.headline ?? "", bannerPath: c.bannerPath ?? old?.bannerPath ?? "",
          accentColor: c.accentColor ?? old?.accentColor ?? "#6d5ce7",
          presenterName: c.presenterName ?? old?.presenterName ?? "",
          presenterBio: c.presenterBio ?? old?.presenterBio ?? "",
          presenterPhotoPath: c.presenterPhotoPath ?? old?.presenterPhotoPath ?? "",
          ...stripeFields,
        };
        if (old) await tx.update(events).set(values).where(eq(events.id, old.id));
        else await tx.insert(events).values({ id, ...values });
        if (plannedRooms) await insertRoomPlans(tx, id, plannedRooms);
        detail = values.title;
        break;
      }
      case "delete_event": {
        const e = await eventFor(c.id);
        const orders = await tx.select().from(ticketOrders).where(eq(ticketOrders.eventId, e.id));
        if (orders.length) fail(409, "Events with checkout history cannot be deleted; mark the event completed instead");
        await tx.delete(registrations).where(eq(registrations.eventId, e.id));
        // Room foreign keys require removing dependent sessions before rooms cascade.
        await tx.delete(sessions).where(eq(sessions.eventId, e.id));
        await tx.delete(events).where(eq(events.id, e.id));
        detail = e.title;
        break;
      }
      case "create_room": {
        const e = await eventFor(c.eventId);
        if ((c.capacity ?? 50) > e.capacity) fail(400, "Room capacity cannot exceed event capacity");
        id = randomUUID();
        await tx.insert(rooms).values({ id, eventId: e.id, name: required(c.name, "Room name"), capacity: c.capacity ?? 50 });
        detail = c.name!;
        break;
      }
      case "delete_room": {
        const [room] = await tx.select().from(rooms).where(eq(rooms.id, required(c.id, "Room")));
        if (!room) fail(404, "Room not found");
        const seats = await tx.select().from(registrations).where(eq(registrations.roomId, room.id));
        const held = await tx.select().from(ticketOrders).where(eq(ticketOrders.roomId, room.id));
        if (seats.length || held.length) fail(409, "This room has reservations or checkout history and cannot be deleted");
        const scheduled = await tx.select().from(sessions).where(eq(sessions.roomId, room.id));
        const attendance = await tx.select({ id: roomVisits.id }).from(roomVisits).where(eq(roomVisits.roomId, room.id)).limit(1);
        if (attendance.length) fail(409, "This room has attendance history and cannot be deleted");
        if (scheduled.length) fail(409, "Remove this room's sessions before deleting it");
        await tx.delete(rooms).where(eq(rooms.id, room.id)); detail = room.name;
        break;
      }
      case "create_session":
      case "update_session": {
        const old = c.action === "update_session" ? await sessionFor(c.id) : undefined;
        if (old && old.status !== "scheduled") fail(409, "Only scheduled sessions can be edited");
        const e = await eventFor(c.eventId ?? old?.eventId);
        const roomId = required(c.roomId ?? old?.roomId, "Room");
        const [room] = await tx.select().from(rooms).where(and(eq(rooms.id, roomId), eq(rooms.eventId, e.id)));
        if (!room) fail(400, "Select a room in this event");
        const interval = dates(c.startsAt ?? old?.startsAt, c.endsAt ?? old?.endsAt);
        if (interval.startsAt < e.startsAt || interval.endsAt > e.endsAt) fail(400, "Session times must be within the event");
        const presenterId = c.presenterId === "" ? null : c.presenterId ?? old?.presenterId ?? null;
        let speakerName = c.presenterName?.trim() ?? old?.speakerName ?? "";
        if (presenterId) {
          const [p] = await tx.select().from(users).where(eq(users.id, presenterId));
          if (!p || !["presenter", "admin"].includes(p.role)) fail(400, "Select a presenter or administrator");
          speakerName = p.name;
        }
        if (!speakerName) fail(400, "A speaker name or presenter account is required");
        const scheduled = await tx.select({ session: sessions, name: users.name }).from(sessions).leftJoin(users, eq(users.id, sessions.presenterId));
        if (scheduled.some(({ session: s, name }) => s.id !== old?.id && s.status !== "ended" &&
          (s.roomId === roomId || (presenterId && s.presenterId ? presenterId === s.presenterId : speakerName.toLowerCase() === (name || s.speakerName).toLowerCase())) &&
          s.startsAt < interval.endsAt && s.endsAt > interval.startsAt)) fail(409, "Room or presenter has a conflicting session");
        const values = { eventId: e.id, roomId, title: required(c.title ?? old?.title, "Title"), description: c.description ?? old?.description ?? "", presenterId, speakerName, ...interval };
        if (old) await tx.update(sessions).set(values).where(eq(sessions.id, old.id));
        else { id = randomUUID(); await tx.insert(sessions).values({ id, ...values }); }
        detail = values.title;
        break;
      }
      case "delete_session": {
        const s = await sessionFor(c.id);
        if (s.status === "live") fail(409, "End the live session before deleting it");
        await tx.delete(sessions).where(eq(sessions.id, s.id)); detail = s.title;
        break;
      }
      case "register": {
        const e = await eventFor(c.eventId);
        if (e.status === "completed" || e.status === "draft") fail(409, "This event is not accepting registrations");
        if (e.stripePriceId) fail(402, "This event requires Stripe checkout; a pass is issued only after payment confirmation");
        if (user.role !== "admin" && e.isPrivate) fail(403, "Private event registration requires an administrator invitation");
        const email = user.role === "admin" ? required(c.email, "Email").toLowerCase() : user.email;
        const name = user.role === "admin" ? required(c.name, "Name") : user.name;
        const existing = await tx.select().from(registrations).where(eq(registrations.eventId, e.id));
        if (existing.some(r => r.email === email)) fail(409, "This participant is already registered");
        const roomId = await assertSeat(tx, e, c.roomId);
        const pending = await tx.select().from(ticketOrders).where(and(eq(ticketOrders.eventId, e.id), eq(ticketOrders.status, "pending")));
        const [account] = await tx.select().from(users).where(eq(users.email, email));
        if (pending.some(o => o.userId === account?.id)) fail(409, "Cancel this account's pending checkout before issuing a free pass");
        id = randomUUID();
        await tx.insert(registrations).values({ id, eventId: e.id, roomId, userId: account?.id ?? null, name, email, passCode: `KBX-${randomBytes(24).toString("hex")}`, createdAt: stamp() });
        detail = `${name} registered for ${e.title}`;
        break;
      }
      case "reserve_room": {
        const e = await eventFor(c.eventId);
        if (e.status === "completed" || e.status === "draft") fail(409, "Room changes are closed for this event");
        const [r] = await tx.select().from(registrations).where(and(eq(registrations.eventId, e.id), eq(registrations.userId, user.id)));
        if (!r) fail(403, "Register for the event before reserving a room");
        const roomId = await assertSeat(tx, e, required(c.roomId, "Room"), r.id);
        await tx.update(registrations).set({ roomId }).where(eq(registrations.id, r.id));
        id = r.id; detail = "Room reservation updated";
        break;
      }
      case "create_coupon": {
        const e = await eventFor(c.eventId);
        id = await createEventCoupon(e, c);
        detail = `Coupon ${c.code!.toUpperCase()} created`;
        break;
      }
      case "toggle_coupon": {
        id = required(c.id, "Coupon");
        if (c.active === undefined) fail(400, "Coupon active state is required");
        await toggleEventCoupon(id, c.active);
        detail = c.active ? "Coupon activated" : "Coupon deactivated";
        break;
      }
      case "room_check_in":
      case "room_check_out": {
        const result = await changeRoomAttendance(tx, user, c);
        id = result.id; detail = result.detail;
        break;
      }
      case "check_in":
      case "check_out": {
        if (!c.id && !c.passCode) fail(400, "Scan or enter a valid pass code");
        const [r] = await tx.select().from(registrations).where(c.passCode ? eq(registrations.passCode, c.passCode.trim()) : eq(registrations.id, c.id!));
        if (!r) fail(404, "Pass not found");
        const desired = c.action === "check_in";
        if (r.checkedIn === desired) fail(409, desired ? "Participant is already checked in" : "Participant is not checked in");
        if (!desired) await leaveRoom(tx, r.id, user.id);
        await tx.update(registrations).set({ checkedIn: desired }).where(eq(registrations.id, r.id));
        await tx.insert(checkins).values({ id: randomUUID(), registrationId: r.id, actorId: user.id, action: c.action, createdAt: stamp() });
        id = r.id; detail = `${r.name} ${desired ? "checked in" : "checked out"}`;
        break;
      }
      case "start_session":
      case "end_session": {
        const s = await sessionFor(c.id); canManageSession(s);
        const starting = c.action === "start_session";
        if (starting && s.status !== "scheduled") fail(409, "Only scheduled sessions can be started");
        if (!starting && s.status !== "live") fail(409, "Only live sessions can be ended");
        const parallel = await tx.select().from(sessions).where(and(eq(sessions.roomId, s.roomId), eq(sessions.status, "live")));
        if (starting && parallel.length) fail(409, "This room already has a live session");
        await tx.update(sessions).set(starting ? { status: "live", startedAt: stamp() } : { status: "ended", endedAt: stamp() }).where(eq(sessions.id, s.id));
        if (starting) await tx.update(events).set({ status: "live" }).where(eq(events.id, s.eventId));
        detail = s.title;
        break;
      }
      case "ask_question": {
        const s = await sessionFor(c.sessionId);
        const [r] = await tx.select().from(registrations).where(and(eq(registrations.eventId, s.eventId), eq(registrations.userId, user.id)));
        if (!r && user.role !== "admin" && s.presenterId !== user.id) fail(403, "Register for the event before asking a question");
        if (s.status === "ended") fail(409, "This session has ended");
        id = randomUUID();
        await tx.insert(questions).values({ id, eventId: s.eventId, sessionId: s.id, userId: user.id, author: user.name, text: required(c.text, "Question"), createdAt: stamp() });
        detail = `Question submitted to ${s.title}`;
        break;
      }
      case "answer_question": {
        const [q] = await tx.select().from(questions).where(eq(questions.id, required(c.id, "Question")));
        if (!q) fail(404, "Question not found");
        canManageSession(await sessionFor(q.sessionId));
        await tx.update(questions).set({ status: "answered", answer: required(c.text, "Answer") }).where(eq(questions.id, q.id));
        detail = "Question answered";
        break;
      }
      case "post_announcement": {
        const e = await eventFor(c.eventId);
        if (user.role !== "admin") {
          const assigned = await tx.select().from(sessions).where(and(eq(sessions.eventId, e.id), eq(sessions.presenterId, user.id)));
          if (!assigned.length) fail(403, "You are not assigned to this event");
        }
        id = randomUUID();
        await tx.insert(announcements).values({ id, eventId: e.id, title: required(c.title, "Title"), text: required(c.text, "Announcement"), author: user.name, createdAt: stamp() });
        detail = c.title!;
        break;
      }
      case "delete_announcement": {
        const deleted = await tx.delete(announcements).where(eq(announcements.id, required(c.id, "Announcement"))).returning();
        if (!deleted.length) fail(404, "Announcement not found");
        detail = deleted[0].title;
        break;
      }
      case "set_role": {
        const role = c.role ?? fail(400, "Role is required");
        const userId = required(c.userId, "User");
        const [target] = await tx.select().from(users).where(eq(users.id, userId));
        if (!target) fail(404, "User not found");
        if (userId === user.id && role !== "admin") fail(409, "You cannot remove your own administrator access");
        await tx.update(users).set({ role, bootstrapGranted: "yes" }).where(eq(users.id, userId));
        detail = `${target.name}: ${role}`;
        break;
      }
      case "trigger_incident": {
        const open = await tx.select().from(incidents).where(eq(incidents.status, "awaiting_approval"));
        if (open.length) fail(409, "Resolve the existing demo incident first");
        const measured = await measureDemoService(250);
        id = randomUUID();
        await tx.insert(incidents).values({
          id, title: "Isolated demo service latency", beforeMs: measured.mean,
          evidence: `Real timer samples: ${measured.samples.join(", ")} ms. Injected demo delay: 250 ms. Threshold: 100 ms. Rule-based detector identified deliberate latency; no LLM or external monitoring used.`,
          recommendation: "Approve allowlisted RESET_DEMO_DELAY: remove the isolated delay, measure three recovery samples, verify mean latency below 100 ms. No shell or infrastructure commands.",
          createdAt: stamp(),
        });
        detail = `Controlled incident detected: ${measured.mean} ms. Awaiting administrator approval.`;
        break;
      }
      case "approve_remediation": {
        const [incident] = await tx.select().from(incidents).where(eq(incidents.id, required(c.id, "Incident")));
        if (!incident) fail(404, "Incident not found");
        if (incident.status !== "awaiting_approval") fail(409, "Incident is already resolved");
        const measured = await measureDemoService(0);
        if (measured.mean >= 100) fail(409, "Recovery verification failed. Retry after the demo service stabilizes.");
        await tx.update(incidents).set({ status: "resolved", afterMs: measured.mean, evidence: `${incident.evidence}\nApproved by ${user.name}. Executed RESET_DEMO_DELAY only. Recovery samples: ${measured.samples.join(", ")} ms. Mean below 100 ms: verified.` }).where(eq(incidents.id, incident.id));
        detail = `Administrator approved RESET_DEMO_DELAY; recovered ${incident.beforeMs} → ${measured.mean} ms; verified.`;
        break;
      }
      default: fail(400, "Unsupported operation");
    }
    await tx.insert(auditLogs).values({ id: randomUUID(), actor: user.name, action: c.action, detail, createdAt: stamp() });
    return { id, message: detail || "Changes saved" };
  });
}
