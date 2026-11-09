import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sessions } from "./sessions";
import { users } from "./users";

export const sessionCheckIns = pgTable("session_check_ins", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull().references(() => users.id),
  kind: text("kind").notNull(),
  prompt: text("prompt").notNull(),
  options: text("options").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("session_check_ins_one_open").on(t.sessionId).where(sql`${t.closedAt} is null`),
]);

export const insertSessionCheckInSchema = createInsertSchema(sessionCheckIns);
export type SessionCheckInRecord = typeof sessionCheckIns.$inferSelect;
