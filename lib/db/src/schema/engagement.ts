import { pgTable, text, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { events } from "./events";
import { sessions, rooms } from "./sessions";
import { users } from "./users";
export const registrations = pgTable("registrations", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id),
  roomId: text("room_id").references(() => rooms.id, { onDelete: "restrict" }),
  paymentStatus: text("payment_status").notNull().default("free"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passCode: text("pass_code").notNull().unique(),
  checkedIn: boolean("checked_in").notNull().default(false),
  createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("registration_event_email").on(t.eventId, t.email)]);
export const checkins = pgTable("checkins", {
  id: text("id").primaryKey(),
  registrationId: text("registration_id").notNull().references(() => registrations.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  actorId: text("actor_id").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
});
export const questions = pgTable("questions", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  author: text("author").notNull(),
  text: text("text").notNull(),
  status: text("status").notNull().default("open"),
  answer: text("answer").notNull().default(""),
  createdAt: text("created_at").notNull(),
});
export const announcements = pgTable("announcements", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  text: text("text").notNull(),
  author: text("author").notNull(),
  createdAt: text("created_at").notNull(),
});
