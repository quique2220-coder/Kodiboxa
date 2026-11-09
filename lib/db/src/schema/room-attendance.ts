import { pgTable, text, index, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { registrations } from "./engagement";
import { rooms } from "./sessions";
import { users } from "./users";

// One current location per registration, independent of its room reservation.
export const roomPresence = pgTable("room_presence", {
  registrationId: text("registration_id").primaryKey().references(() => registrations.id, { onDelete: "cascade" }),
  roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "restrict" }),
  enteredAt: timestamp("entered_at", { withTimezone: true, mode: "string" }).notNull(),
}, t => [index("room_presence_room_idx").on(t.roomId)]);

export const roomVisits = pgTable("room_visits", {
  id: text("id").primaryKey(),
  registrationId: text("registration_id").notNull().references(() => registrations.id, { onDelete: "cascade" }),
  roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "restrict" }),
  actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
}, t => [index("room_visits_room_idx").on(t.roomId)]);
export const insertRoomPresenceSchema = createInsertSchema(roomPresence);
export const insertRoomVisitSchema = createInsertSchema(roomVisits);
export type RoomPresence = typeof roomPresence.$inferSelect;
export type RoomVisit = typeof roomVisits.$inferSelect;
