import { pgTable, text, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sessionCheckIns } from "./session-check-ins";
import { users } from "./users";

export const sessionCheckInResponses = pgTable("session_check_in_responses", {
  checkInId: text("check_in_id").notNull().references(() => sessionCheckIns.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  choice: integer("choice").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.checkInId, t.userId] })]);

export const insertSessionCheckInResponseSchema = createInsertSchema(sessionCheckInResponses);
export type SessionCheckInResponseRecord = typeof sessionCheckInResponses.$inferSelect;
