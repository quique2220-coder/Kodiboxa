import { randomUUID } from "node:crypto";
import { db, users, rooms, sessions } from "@workspace/db";
import { ne } from "drizzle-orm";
import { ExecuteCommandBody } from "@workspace/api-zod";
import { fail } from "./auth";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Plans = NonNullable<ReturnType<typeof ExecuteCommandBody.parse>["roomPlans"]>;
type Planned = { title: string; presenterId: string | null; speakerName: string; startsAt: string; endsAt: string };

export async function validateRoomPlans(tx: Tx, plans: Plans, event: { startsAt: string; endsAt: string; capacity: number }) {
  const people = await tx.select().from(users);
  const booked = await tx.select().from(sessions).where(ne(sessions.status, "ended"));
  const seenNames = new Set<string>();
  const planned: (Planned & { roomIndex: number })[] = [];
  return plans.map((room, roomIndex) => {
    const name = room.name.trim();
    if (!name || seenNames.has(name.toLowerCase())) fail(400, "Give every room a different, nonempty name");
    seenNames.add(name.toLowerCase());
    if (room.capacity > event.capacity) fail(400, `${name}: room capacity cannot exceed event capacity`);
    const agenda = room.sessions.map(s => {
      const title = s.title.trim(), speakerName = s.presenterName.trim();
      if (!title || !speakerName) fail(400, `${name}: session title and speaker name are required`);
      const a = new Date(s.startsAt), b = new Date(s.endsAt);
      if (!Number.isFinite(+a) || !Number.isFinite(+b) || b <= a) fail(400, `${name}: session end must be after its start`);
      const startsAt = a.toISOString(), endsAt = b.toISOString();
      if (startsAt < event.startsAt || endsAt > event.endsAt) fail(400, `${name}: session times must fit inside the event`);
      const presenterId = s.presenterId?.trim() || null;
      const person = people.find(p => p.id === presenterId);
      if (presenterId && (!person || !["admin", "presenter"].includes(person.role))) fail(400, "Select a presenter or administrator account");
      const normalized = { title, speakerName: person?.name || speakerName, presenterId, startsAt, endsAt };
      const sameSpeaker = (x: { presenterId: string | null; speakerName: string }) =>
        presenterId && x.presenterId ? presenterId === x.presenterId : normalized.speakerName.toLowerCase() === x.speakerName.toLowerCase();
      if (planned.some(x => x.startsAt < endsAt && x.endsAt > startsAt && (x.roomIndex === roomIndex || sameSpeaker(x)))) {
        fail(409, `${name}: a room or speaker has overlapping sessions`);
      }
      if (booked.some(x => x.startsAt < endsAt && x.endsAt > startsAt && sameSpeaker({
        presenterId: x.presenterId,
        speakerName: people.find(p => p.id === x.presenterId)?.name || x.speakerName,
      }))) fail(409, `${normalized.speakerName} already has a session at this time`);
      planned.push({ ...normalized, roomIndex });
      return normalized;
    });
    return { name, capacity: room.capacity, agenda };
  });
}

export async function insertRoomPlans(tx: Tx, eventId: string, plans: Awaited<ReturnType<typeof validateRoomPlans>>) {
  for (const plan of plans) {
    const roomId = randomUUID();
    await tx.insert(rooms).values({ id: roomId, eventId, name: plan.name, capacity: plan.capacity });
    await tx.insert(sessions).values(plan.agenda.map(s => ({ id: randomUUID(), eventId, roomId, ...s })));
  }
}
