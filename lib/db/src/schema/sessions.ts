import { pgTable, text, integer } from "drizzle-orm/pg-core";
import { events } from "./events";
import { users } from "./users";
export const rooms = pgTable("rooms", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
});
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  roomId: text("room_id").notNull().references(() => rooms.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  presenterId: text("presenter_id").references(() => users.id),
  speakerName: text("speaker_name").notNull().default(""),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  status: text("status").notNull().default("scheduled"),
  startedAt: text("started_at"),
  endedAt: text("ended_at"),
});
