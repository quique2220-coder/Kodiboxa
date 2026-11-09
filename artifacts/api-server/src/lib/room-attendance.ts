import { randomUUID } from "node:crypto";
import { db, users, events, rooms, registrations, roomPresence, roomVisits, checkins } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { ExecuteCommandBody } from "@workspace/api-zod";
import { fail } from "./auth";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type User = typeof users.$inferSelect;
type Input = ReturnType<typeof ExecuteCommandBody.parse>;

export async function leaveRoom(tx: Tx, registrationId: string, actorId: string) {
  const [presence] = await tx.delete(roomPresence).where(eq(roomPresence.registrationId, registrationId)).returning();
  if (presence) await tx.insert(roomVisits).values({
    id: randomUUID(), registrationId, roomId: presence.roomId,
    actorId, action: "room_check_out", createdAt: new Date().toISOString(),
  });
}

// Caller holds the shared advisory transaction lock. Capacity and duplicates
// are checked against persistent rows, never against a browser-side counter.
export async function changeRoomAttendance(tx: Tx, user: User, input: Input) {
  if (!input.roomId) fail(400, "Choose a room");
  const [room] = await tx.select().from(rooms).where(eq(rooms.id, input.roomId));
  if (!room) fail(404, "Room not found");
  const [event] = await tx.select().from(events).where(eq(events.id, room.eventId));
  if (!event) fail(404, "Event not found");
  if (user.role !== "admin" && (input.id || input.passCode)) fail(403, "Participants may check in only their own account");
  const [pass] = await tx.select().from(registrations).where(
    user.role === "admin" && input.passCode ? eq(registrations.passCode, input.passCode.trim()) :
    user.role === "admin" && input.id ? eq(registrations.id, input.id) :
    and(eq(registrations.eventId, event.id), eq(registrations.userId, user.id)),
  );
  if (!pass || pass.eventId !== event.id) fail(403, "A confirmed pass for this event is required");
  const [presence] = await tx.select().from(roomPresence).where(eq(roomPresence.registrationId, pass.id));
  const entering = input.action === "room_check_in";
  if (entering) {
    if (event.status === "draft" || event.status === "completed") fail(409, "Room entry is closed for this event");
    if (presence) {
      if (presence.roomId === room.id) fail(409, "Already checked into this room; the count was not increased");
      fail(409, "Check out of the current room before entering another room");
    }
    const [count] = await tx.select({ value: sql<number>`count(*)::int` }).from(roomPresence).where(eq(roomPresence.roomId, room.id));
    if (count.value >= room.capacity) fail(409, "This room is full");
    const now = new Date().toISOString();
    await tx.insert(roomPresence).values({ registrationId: pass.id, roomId: room.id, enteredAt: now });
    await tx.insert(roomVisits).values({ id: randomUUID(), registrationId: pass.id, roomId: room.id, actorId: user.id, action: "room_check_in", createdAt: now });
    if (!pass.checkedIn) {
      await tx.update(registrations).set({ checkedIn: true }).where(eq(registrations.id, pass.id));
      await tx.insert(checkins).values({ id: randomUUID(), registrationId: pass.id, actorId: user.id, action: "check_in", createdAt: now });
    }
  } else {
    if (!presence || presence.roomId !== room.id) fail(409, "Not checked into this room; the count was not changed");
    await leaveRoom(tx, pass.id, user.id);
  }
  return { id: pass.id, detail: `${pass.name} ${entering ? "checked into" : "checked out of"} ${room.name}` };
}
