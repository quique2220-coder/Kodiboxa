import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("participant"),
  bootstrapGranted: text("bootstrap_granted").notNull().default("no"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
