import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/express";
import { db, users, events, rooms, registrations, roomPresence, roomVisits } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { execute } from "../src/lib/commands";
import { roomOperations, roomEntry } from "../src/lib/room-reporting";

async function main() {
  if (process.env.NODE_ENV === "production" || !process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")) throw new Error("Development-only test");
  const key = randomUUID().slice(0, 8);
  const accounts: (typeof users.$inferSelect)[] = [];
  const eventIds: string[] = [];
  const persist = () => writeFile("/tmp/room-attendance-fixture.json", JSON.stringify({ key, accounts: accounts.map(a => ({ id: a.id, email: a.email })), eventIds }));
  for (const role of ["admin", "participant", "participant"] as const) {
    const email = `rooms-${accounts.length}-${key}+clerk_test@example.com`;
    const identity = await clerkClient.users.createUser({
      emailAddress: [email], password: "VerificationOnly-RoomDesk-2026!", firstName: "Room", lastName: `Verification ${accounts.length}`, skipPasswordChecks: true,
    });
    const [user] = await db.insert(users).values({ id: identity.id, email, name: `Room verification ${key} ${accounts.length}`, role, bootstrapGranted: "yes" }).returning();
    accounts.push(user); await persist();
  }
  const [admin, attendee, other] = accounts;
  const startsAt = new Date(Date.now() - 3600000).toISOString(), endsAt = new Date(Date.now() + 7200000).toISOString();
  const base = { action: "create_event" as const, title: `[Room verification ${key}] Entrance counting`, type: "conference" as const, status: "live" as const, capacity: 3, startsAt, endsAt, isPrivate: false, ticketAmount: 0 };
  await assert.rejects(execute(admin, base), /Specify the number of rooms/);
  await assert.rejects(execute(admin, { ...base, roomPlans: [{ name: "Bad room", capacity: 1, sessions: [
    { title: "First", presenterName: "One", startsAt, endsAt }, { title: "Overlapping", presenterName: "Two", startsAt, endsAt },
  ] }] }), /overlapping/);
  assert.equal((await db.select().from(events).where(eq(events.title, base.title))).length, 0, "Invalid plans must not create a partial event");
  const plans = [
    { name: "Salon Alpha", capacity: 2, sessions: [{ title: "Opening workshop", presenterName: `Alpha guest ${key}`, startsAt, endsAt }] },
    { name: "Salon Beta", capacity: 1, sessions: [{ title: "Discussion", presenterName: `Beta guest ${key}`, startsAt, endsAt }] },
  ];
  const event = await execute(admin, { ...base, roomPlans: plans }); eventIds.push(event.id); await persist();
  const eventRooms = await db.select().from(rooms).where(eq(rooms.eventId, event.id));
  const alpha = eventRooms.find(r => r.name === "Salon Alpha")!, beta = eventRooms.find(r => r.name === "Salon Beta")!;
  const p1 = await execute(attendee, { action: "register", eventId: event.id, roomId: alpha.id });
  const p2 = await execute(other, { action: "register", eventId: event.id, roomId: beta.id });
  const repeats = await Promise.allSettled(Array.from({ length: 8 }, () => execute(attendee, { action: "room_check_in", roomId: alpha.id })));
  assert.equal(repeats.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await roomOperations(event.id)).rooms.find(r => r.id === alpha.id)?.occupancy, 1);
  assert.equal((await db.select().from(roomVisits).where(and(eq(roomVisits.registrationId, p1.id), eq(roomVisits.action, "room_check_in")))).length, 1);
  await assert.rejects(execute(attendee, { action: "room_check_in", roomId: beta.id }), /Check out of the current room/);
  await assert.rejects(execute(other, { action: "room_check_out", roomId: alpha.id, id: p1.id }), /only their own/);
  const own = await roomEntry(alpha.id, attendee);
  assert.equal(own.presence?.roomId, alpha.id);
  assert.equal("occupancy" in own.room, false, "Participant entry must not contain operational counters");
  assert.equal(own.sessions[0].presenterName, `Alpha guest ${key}`);
  await execute(attendee, { action: "room_check_out", roomId: alpha.id });
  await assert.rejects(execute(attendee, { action: "room_check_out", roomId: alpha.id }), /Not checked into/);
  const race = await Promise.allSettled([attendee, other].map(u => execute(u, { action: "room_check_in", roomId: beta.id })));
  assert.equal(race.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await roomOperations(event.id)).rooms.find(r => r.id === beta.id)?.occupancy, 1);
  const [inside] = await db.select().from(roomPresence).where(eq(roomPresence.roomId, beta.id));
  await execute(admin, { action: "check_out", id: inside.registrationId });
  assert.equal((await roomOperations(event.id)).rooms.find(r => r.id === beta.id)?.occupancy, 0, "Event checkout must release room occupancy");
  await execute(attendee, { action: "room_check_in", roomId: alpha.id });
  const totals = await roomOperations(event.id);
  assert.equal(totals.rooms.find(r => r.id === alpha.id)?.uniqueVisitors, 1, "Re-entry must not inflate unique visitors");
  await assert.rejects(execute(attendee, { action: "create_room", eventId: event.id, name: "Unauthorized" }), /Administrator permission/);
  await assert.rejects(execute(admin, { action: "update_event", id: event.id, roomPlans: plans }), /never replace attendance history/);
  await assert.rejects(execute(admin, { action: "delete_room", id: alpha.id }), /reservations|attendance history/);
  const attendeeRows = await db.select().from(registrations).where(eq(registrations.eventId, event.id));
  await writeFile("/tmp/room-attendance-fixture.json", JSON.stringify({
    key, accounts: accounts.map(a => ({ id: a.id, email: a.email })), eventIds, eventId: event.id,
    alphaId: alpha.id, betaId: beta.id, passes: attendeeRows.map(r => ({ id: r.id, userId: r.userId, passCode: r.passCode })),
  }));
  console.log("PASS: atomic event/room/speaker planning; rollback; concurrent duplicate scans; room capacity; own-account enforcement; checkout/re-entry; persistent counts and unique visitors.");
}
main().then(() => process.exit(0)).catch(error => { console.error({ verificationFailed: true, message: error.message }); process.exit(1); });
