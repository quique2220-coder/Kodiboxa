import { pgTable, text, doublePrecision } from "drizzle-orm/pg-core";
export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  createdAt: text("created_at").notNull(),
});
export const incidents = pgTable("incidents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull().default("awaiting_approval"),
  evidence: text("evidence").notNull(),
  recommendation: text("recommendation").notNull(),
  beforeMs: doublePrecision("before_ms").notNull(),
  afterMs: doublePrecision("after_ms"),
  createdAt: text("created_at").notNull(),
});
