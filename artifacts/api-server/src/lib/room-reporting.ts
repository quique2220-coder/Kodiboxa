import { db, rooms, events, sessions, users, registrations, roomPresence, roomVisits } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { fail } from "./auth";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function schedule(tx: Tx, eventId: string, roomId?: string) {
  const rows = await tx.select({ session: sessions, speaker: users.name }).from(sessions)
    .leftJoin(users, eq(users.id, sessions.presenterId))
    .where(roomId ? and(eq(sessions.eventId, eventId), eq(sessions.roomId, roomId)) : eq(sessions.eventId, eventId))
    .orderBy(sessions.startsAt);
  return rows.map(({ session: s, speaker }) => ({
    ...s, presenterId: s.presenterId || "", presenterName: speaker || s.speakerName || "Speaker to be announced",
  }));
}

export async function roomOperations(eventId: string) {
  return db.transaction(async tx => {
    const [event] = await tx.select({ id: events.id }).from(events).where(eq(events.id, eventId));
    if (!event) fail(404, "Event not found");
    const eventRooms = await tx.select().from(rooms).where(eq(rooms.eventId, eventId)).orderBy(rooms.name);
    const agenda = await schedule(tx, eventId);
    const occupied = await tx.select({ roomId: roomPresence.roomId, value: sql<number>`count(*)::int` })
      .from(roomPresence).innerJoin(rooms, eq(rooms.id, roomPresence.roomId))
      .where(eq(rooms.eventId, eventId)).groupBy(roomPresence.roomId);
    const visited = await tx.select({ roomId: roomVisits.roomId, value: sql<number>`count(distinct ${roomVisits.registrationId})::int` })
      .from(roomVisits).innerJoin(rooms, eq(rooms.id, roomVisits.roomId))
      .where(and(eq(rooms.eventId, eventId), eq(roomVisits.action, "room_check_in"))).groupBy(roomVisits.roomId);
    const activity = await tx.select({
      id: roomVisits.id, roomId: rooms.id, roomName: rooms.name, participantName: registrations.name,
      action: roomVisits.action, createdAt: roomVisits.createdAt,
    }).from(roomVisits).innerJoin(rooms, eq(rooms.id, roomVisits.roomId))
      .innerJoin(registrations, eq(registrations.id, roomVisits.registrationId))
      .where(eq(rooms.eventId, eventId)).orderBy(desc(roomVisits.createdAt)).limit(30);
    return {
      eventId, updatedAt: new Date().toISOString(),
      rooms: eventRooms.map(room => ({
        id: room.id, name: room.name, capacity: room.capacity,
        occupancy: occupied.find(x => x.roomId === room.id)?.value || 0,
        uniqueVisitors: visited.find(x => x.roomId === room.id)?.value || 0,
        sessions: agenda.filter(s => s.roomId === room.id),
      })),
      recentActivity: activity.map(a => ({ ...a, createdAt: new Date(a.createdAt).toISOString() })),
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function roomEntry(roomId: string, user: typeof users.$inferSelect) {
  return db.transaction(async tx => {
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId));
    if (!room) fail(404, "Room not found");
    const [event] = await tx.select({
      id: events.id, title: events.title, description: events.description, status: events.status,
      location: events.location, startsAt: events.startsAt, endsAt: events.endsAt,
    }).from(events).where(eq(events.id, room.eventId));
    if (!event) fail(404, "Event not found");
    const [registration] = await tx.select({ id: registrations.id }).from(registrations)
      .where(and(eq(registrations.eventId, event.id), eq(registrations.userId, user.id)));
    if (!registration && user.role !== "admin") fail(403, "Register for this event and obtain a confirmed pass before entering a room");
    const [presence] = registration ? await tx.select({
      roomId: rooms.id, roomName: rooms.name, enteredAt: roomPresence.enteredAt,
    }).from(roomPresence).innerJoin(rooms, eq(rooms.id, roomPresence.roomId))
      .where(eq(roomPresence.registrationId, registration.id)) : [];
    return {
      room, event, sessions: await schedule(tx, event.id, room.id), registered: Boolean(registration),
      presence: presence ? { ...presence, enteredAt: new Date(presence.enteredAt).toISOString() } : null,
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
