import { createHash, randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/express";
import { db, users, registrations, events, crmContacts, crmConsentEvents, auditLogs } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateCrmContactBody, UpdateCrmContactBody, SaveCommunicationPreferencesBody } from "@workspace/api-zod";
import { fail } from "./auth";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type User = typeof users.$inferSelect;
type Contact = typeof crmContacts.$inferSelect;
export const NOTICE_VERSION = "event-marketing-v1";
export const EMAIL_NOTICE = "I agree to receive KODIBOXA future-event updates and marketing by email. This is optional and I can withdraw consent in Communication preferences.";
export const SMS_NOTICE = "I agree to receive KODIBOXA event marketing by SMS at the number I provide. Consent is optional and is not required to register. Frequency varies; message and data rates may apply. I can withdraw consent in Communication preferences. Phone verification and a sending service are required before delivery.";
export function normalizePhone(value: string) {
  const phone = value.trim();
  if (phone && !/^\+[1-9]\d{6,14}$/.test(phone)) fail(400, "Use an international phone number such as +15551234567");
  return phone;
}
const tags = (values: string[]) => [...new Set(values.map(t => t.trim().toLowerCase()).filter(Boolean))];
export async function crmWrite<T>(operation: (tx: Tx) => Promise<T>) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(47018032)`);
    return operation(tx);
  });
}
export async function crmAudit(tx: Tx, user: User, action: string, detail: string) {
  await tx.insert(auditLogs).values({ id: randomUUID(), actor: user.name, action, detail, createdAt: new Date().toISOString() });
}
async function consent(tx: Tx, contact: Contact, user: User, channel: "email" | "sms", enabled: boolean, notice: string) {
  await tx.insert(crmConsentEvents).values({
    id: randomUUID(), contactId: contact.id, actorId: user.id, channel,
    action: enabled ? "opt_in" : "opt_out", notice: `[${NOTICE_VERSION}] ${notice}`,
    destinationHash: createHash("sha256").update(channel === "email" ? contact.email : contact.phone).digest("hex"),
  });
}
export async function createContact(user: User, input: ReturnType<typeof CreateCrmContactBody.parse>) {
  return crmWrite(async tx => {
    const name = input.name.trim(), email = input.email.trim().toLowerCase();
    if (!name) fail(400, "Contact name is required");
    const id = randomUUID();
    const inserted = await tx.insert(crmContacts).values({
      id, name, email, phone: normalizePhone(input.phone || ""), company: input.company?.trim() || "",
      notes: input.notes || "", tags: tags(input.tags || []),
    }).onConflictDoNothing({ target: crmContacts.email }).returning({ id: crmContacts.id });
    if (!inserted.length) fail(409, "A contact with this email already exists, including archived contacts");
    await crmAudit(tx, user, "crm_contact_create", `Contact ${id} created without marketing consent`);
    return { id, message: "Contact created; marketing consent has not been granted" };
  });
}
export async function updateContact(user: User, id: string, input: ReturnType<typeof UpdateCrmContactBody.parse>) {
  return crmWrite(async tx => {
    const [old] = await tx.select().from(crmContacts).where(eq(crmContacts.id, id));
    if (!old) fail(404, "Contact not found");
    const name = input.name?.trim() ?? old.name;
    if (!name) fail(400, "Contact name is required");
    const phone = input.phone === undefined ? old.phone : normalizePhone(input.phone);
    const phoneChanged = phone !== old.phone;
    if (input.revokeEmail && old.emailOptIn) await consent(tx, old, user, "email", false, "Administrator recorded an email opt-out request.");
    if ((input.revokeSms || phoneChanged) && old.smsOptIn) await consent(tx, old, user, "sms", false, phoneChanged ? "Phone changed; previous SMS consent withdrawn." : "Administrator recorded an SMS opt-out request.");
    await tx.update(crmContacts).set({
      name, phone, company: input.company?.trim() ?? old.company, notes: input.notes ?? old.notes,
      tags: input.tags ? tags(input.tags) : old.tags, archived: input.archived ?? old.archived,
      emailOptIn: input.revokeEmail ? false : old.emailOptIn,
      smsOptIn: input.revokeSms || phoneChanged ? false : old.smsOptIn,
      phoneVerified: phoneChanged ? false : old.phoneVerified,
      smsConsentAt: phoneChanged ? null : old.smsConsentAt, updatedAt: new Date().toISOString(),
    }).where(eq(crmContacts.id, id));
    await crmAudit(tx, user, "crm_contact_update", `Contact ${id} updated; no consent granted by an administrator`);
    return { id, message: "Contact updated" };
  });
}
export async function syncContacts(user: User) {
  return crmWrite(async tx => {
    // Illustrative seed attendees must never become a real marketing audience.
    const rows = await tx.select({ registration: registrations }).from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId)).where(eq(events.example, false));
    const added = await upsertRegistrationContacts(tx, rows.map(r => r.registration));
    await crmAudit(tx, user, "crm_contacts_sync", `${added} real-event contacts added; existing metadata and consent preserved`);
    return { id: user.id, message: `${added} contacts added. Existing contacts, opt-outs and archived states were preserved.` };
  });
}
export async function upsertRegistrationContacts(tx: Tx, rows: Pick<typeof registrations.$inferSelect, "email" | "name" | "userId">[]) {
  const distinct = new Map(rows.map(r => [r.email.trim().toLowerCase(), r]));
  const candidates = [...distinct].map(([email, r]) => ({
    id: randomUUID(), email, name: r.name, userId: r.userId, source: "registration",
  }));
  let added = 0;
  for (let i = 0; i < candidates.length; i += 250) {
    added += (await tx.insert(crmContacts).values(candidates.slice(i, i + 250))
      .onConflictDoNothing({ target: crmContacts.email }).returning({ id: crmContacts.id })).length;
  }
  return added;
}
function preferences(user: User, contact?: Contact) {
  return {
    email: user.email, phone: contact?.phone || "", emailOptIn: contact?.emailOptIn || false,
    smsOptIn: contact?.smsOptIn || false, phoneVerified: contact?.phoneVerified || false,
    deliveryAvailable: false, emailNotice: EMAIL_NOTICE, smsNotice: SMS_NOTICE, noticeVersion: NOTICE_VERSION,
  };
}
async function ownContact(tx: Tx, user: User) {
  const [contact] = await tx.select().from(crmContacts).where(eq(crmContacts.email, user.email.toLowerCase()));
  if (contact?.userId && contact.userId !== user.id) fail(409, "This contact is associated with another account; contact the organizer");
  return contact;
}
export async function getPreferences(user: User) {
  return db.transaction(async tx => preferences(user, await ownContact(tx, user)));
}
export async function savePreferences(user: User, input: ReturnType<typeof SaveCommunicationPreferencesBody.parse>) {
  if (input.noticeVersion !== NOTICE_VERSION) fail(409, "The consent notice changed. Refresh preferences and review the current wording before saving.");
  const phone = normalizePhone(input.phone);
  if (input.smsOptIn && !phone) fail(400, "Provide a phone number before choosing SMS marketing");
  if (input.emailOptIn) {
    const identity = await clerkClient.users.getUser(user.id);
    const primary = identity.emailAddresses.find(e => e.id === identity.primaryEmailAddressId);
    if (!primary || primary.verification?.status !== "verified" || primary.emailAddress.toLowerCase() !== user.email.toLowerCase()) {
      fail(403, "Verify your current account email before opting in. If your sign-in email changed, ask the organizer to update your account.");
    }
  }
  return crmWrite(async tx => {
    let old = await ownContact(tx, user);
    if (!old) {
      [old] = await tx.insert(crmContacts).values({
        id: randomUUID(), userId: user.id, email: user.email.toLowerCase(), name: user.name, source: "preferences",
      }).returning();
    }
    const changedPhone = phone !== old.phone;
    if (old.emailOptIn !== input.emailOptIn) await consent(tx, old, user, "email", input.emailOptIn, EMAIL_NOTICE);
    if (changedPhone && old.smsOptIn) await consent(tx, old, user, "sms", false, "Phone changed; previous SMS consent withdrawn.");
    if ((changedPhone ? false : old.smsOptIn) !== input.smsOptIn) {
      await consent(tx, { ...old, phone }, user, "sms", input.smsOptIn, SMS_NOTICE);
    }
    const now = new Date().toISOString();
    const [saved] = await tx.update(crmContacts).set({
      userId: user.id, emailVerified: true, phone, emailOptIn: input.emailOptIn, smsOptIn: input.smsOptIn,
      phoneVerified: changedPhone ? false : old.phoneVerified,
      emailConsentAt: input.emailOptIn && !old.emailOptIn ? now : old.emailConsentAt,
      smsConsentAt: input.smsOptIn && (!old.smsOptIn || changedPhone) ? now : changedPhone ? null : old.smsConsentAt,
      updatedAt: now,
    }).where(eq(crmContacts.id, old.id)).returning();
    await crmAudit(tx, user, "crm_own_preferences", "Participant saved their own communication preferences; no messages sent");
    return preferences(user, saved);
  });
}
