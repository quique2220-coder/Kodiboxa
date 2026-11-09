import { pgTable, text, boolean, timestamp, index, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { users } from "./users";
import { events } from "./events";

export const crmContacts = pgTable("crm_contacts", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  company: text("company").notNull().default(""),
  notes: text("notes").notNull().default(""),
  tags: text("tags").array().notNull().default([]),
  source: text("source").notNull().default("manual"),
  archived: boolean("archived").notNull().default(false),
  emailOptIn: boolean("email_opt_in").notNull().default(false),
  smsOptIn: boolean("sms_opt_in").notNull().default(false),
  emailVerified: boolean("email_verified").notNull().default(false),
  phoneVerified: boolean("phone_verified").notNull().default(false),
  emailConsentAt: timestamp("email_consent_at", { withTimezone: true, mode: "string" }),
  smsConsentAt: timestamp("sms_consent_at", { withTimezone: true, mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});
export const crmConsentEvents = pgTable("crm_consent_events", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").notNull().references(() => crmContacts.id, { onDelete: "cascade" }),
  actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
  channel: text("channel").notNull(),
  action: text("action").notNull(),
  destinationHash: text("destination_hash").notNull(),
  notice: text("notice").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, t => [index("crm_consent_contact_idx").on(t.contactId)]);
export const crmCampaigns = pgTable("crm_campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  channel: text("channel").notNull(),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  promotedEventId: text("promoted_event_id").references(() => events.id, { onDelete: "set null" }),
  // Keep a removed audience filter rather than silently broadening it to everyone.
  audienceEventId: text("audience_event_id"),
  tag: text("tag").notNull().default(""),
  status: text("status").notNull().default("draft"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});
export const crmIntegrations = pgTable("crm_integrations", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull().unique(),
  encryptedCredential: text("encrypted_credential").notNull(),
  nonce: text("nonce").notNull(),
  authenticationTag: text("authentication_tag").notNull(),
  connectedBy: text("connected_by").references(() => users.id, { onDelete: "set null" }),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "string" }).notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: "string" }),
  lastSyncHash: text("last_sync_hash").notNull().default(""),
});
export const crmZapierExports = pgTable("crm_zapier_exports", {
  contactId: text("contact_id").notNull().references(() => crmContacts.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  destinationHash: text("destination_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.contactId, t.channel] })]);
export const insertCrmContactSchema = createInsertSchema(crmContacts);
export const insertCrmCampaignSchema = createInsertSchema(crmCampaigns);
export type CrmContact = typeof crmContacts.$inferSelect;
export type CrmCampaign = typeof crmCampaigns.$inferSelect;
