import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { clerkClient } from "@clerk/express";
import { db, users, events, rooms, registrations, crmContacts, crmCampaigns, crmConsentEvents, auditLogs } from "@workspace/db";
import { eq, inArray, like } from "drizzle-orm";
import { execute } from "../src/lib/commands";
import { createContact, updateContact, getPreferences, savePreferences, NOTICE_VERSION, upsertRegistrationContacts, crmWrite } from "../src/lib/crm-contacts";
import { getCrmData, saveCampaign, deleteCampaign } from "../src/lib/crm-campaigns";

const file = "/tmp/crm-verification.json";
async function main() {
  if (process.env.NODE_ENV === "production" || !process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")) throw new Error("Development-only test");
  if (process.argv.includes("--cleanup")) {
    const fixture = JSON.parse(await readFile(file, "utf8"));
    for (const account of fixture.accounts) {
      if (!account.email.includes(`-${fixture.key}+clerk_test@`)) throw new Error("Fixture identity guard failed");
      const [user] = await db.select().from(users).where(eq(users.id, account.id));
      if (!user?.name.startsWith(`CRM verification ${fixture.key}`)) throw new Error("Fixture database identity guard failed");
    }
    // Only uniquely tagged synthetic rows; never remove contacts imported from real events.
    const contacts = await db.select().from(crmContacts).where(like(crmContacts.email, `%${fixture.key}+clerk_test@example.com`));
    for (const c of contacts) await db.delete(crmContacts).where(eq(crmContacts.id, c.id));
    await db.delete(crmCampaigns).where(like(crmCampaigns.name, `CRM UI ${fixture.key}%`));
    for (const id of fixture.campaignIds) await db.delete(crmCampaigns).where(eq(crmCampaigns.id, id));
    const [event] = await db.select().from(events).where(eq(events.id, fixture.eventId));
    if (event) {
      assert.equal(event.title, `[CRM verification ${fixture.key}] Future networking`);
      await execute(fixture.accounts[0], { action: "delete_event", id: event.id });
    }
    await db.delete(auditLogs).where(inArray(auditLogs.actor, fixture.accounts.map((a: { name: string }) => a.name)));
    for (const a of fixture.accounts) {
      await db.delete(users).where(eq(users.id, a.id));
      await clerkClient.users.deleteUser(a.id);
    }
    await unlink(file);
    console.log("Only synthetic CRM contacts, consent evidence, drafts, event and accounts removed.");
    return;
  }
  const key = randomUUID().slice(0, 8), accounts: (typeof users.$inferSelect)[] = [], campaignIds: string[] = [];
  let eventId = "", contactId = "";
  const persist = () => writeFile(file, JSON.stringify({ key, accounts, eventId, contactId, campaignIds }));
  for (const role of ["admin", "participant"] as const) {
    const email = `crm-${role}-${key}+clerk_test@example.com`;
    const identity = await clerkClient.users.createUser({
      emailAddress: [email], firstName: "CRM", lastName: `Verification ${key} ${role}`,
      password: "VerificationOnly-CrmDesk-2026!", skipPasswordChecks: true,
    });
    const [u] = await db.insert(users).values({ id: identity.id, email, name: `CRM verification ${key} ${role}`, role, bootstrapGranted: "yes" }).returning();
    accounts.push(u); await persist();
  }
  const [admin, person] = accounts;
  assert.equal((await getPreferences(person)).emailOptIn, false);
  assert.equal((await db.select().from(crmContacts).where(eq(crmContacts.email, person.email))).length, 0, "GET must not subscribe or create a contact");
  const start = new Date(Date.now() + 86400000).toISOString(), end = new Date(Date.now() + 90000000).toISOString();
  eventId = (await execute(admin, {
    action: "create_event", title: `[CRM verification ${key}] Future networking`, type: "conference", status: "upcoming",
    startsAt: start, endsAt: end, capacity: 5, ticketAmount: 0, isPrivate: false,
    roomPlans: [{ name: "Networking room", capacity: 5, sessions: [{ title: "Meet the community", presenterName: `CRM guest ${key}`, startsAt: start, endsAt: end }] }],
  })).id;
  await persist();
  const [room] = await db.select().from(rooms).where(eq(rooms.eventId, eventId));
  await execute(person, { action: "register", eventId, roomId: room.id });
  contactId = (await createContact(admin, { name: `CRM contact ${key}`, email: person.email, tags: [`crm-${key}`], notes: "Private networking note" })).id;
  await persist();
  await assert.rejects(createContact(admin, { name: "Duplicate", email: person.email.toUpperCase() }), /already exists/);
  let workspace = await getCrmData(), contact = workspace.contacts.find(c => c.id === contactId)!;
  assert.equal(contact.emailOptIn, false); assert.equal(contact.smsOptIn, false);
  assert.equal(contact.history.some(h => h.eventId === eventId), true);
  const basePrefs = { phone: "+15005550006", emailOptIn: true, smsOptIn: true, noticeVersion: NOTICE_VERSION };
  await assert.rejects(savePreferences(person, { ...basePrefs, noticeVersion: "obsolete" }), /notice changed/);
  await savePreferences(person, basePrefs);
  const emailDraft = await saveCampaign(admin, { name: `Backend draft ${key}`, channel: "email", subject: "Invitation", body: "Hello", audienceEventId: eventId, promotedEventId: eventId, tag: `crm-${key}` });
  campaignIds.push(emailDraft.id); await persist();
  const smsDraft = await saveCampaign(admin, { name: `SMS draft ${key}`, channel: "sms", subject: "", body: "Hello", audienceEventId: eventId });
  campaignIds.push(smsDraft.id); await persist();
  workspace = await getCrmData();
  assert.equal(workspace.campaigns.find(c => c.id === emailDraft.id)?.eligibleContacts, 1);
  assert.equal(workspace.campaigns.find(c => c.id === smsDraft.id)?.eligibleContacts, 0, "Unverified phones must be excluded");
  assert.equal(workspace.emailReady, false); assert.equal(workspace.smsReady, false);
  await updateContact(admin, contactId, { archived: true });
  assert.equal((await getCrmData()).campaigns.find(c => c.id === emailDraft.id)?.eligibleContacts, 0);
  const [registration] = await db.select().from(registrations).where(eq(registrations.eventId, eventId));
  assert.equal(await crmWrite(tx => upsertRegistrationContacts(tx, [registration, registration])), 0, "Sync must deduplicate and preserve existing contacts");
  [contact] = (await getCrmData()).contacts.filter(c => c.id === contactId);
  assert.equal(contact.archived, true); assert.equal(contact.emailOptIn, true); assert.equal(contact.notes, "Private networking note");
  await updateContact(admin, contactId, { archived: false, phone: "+15005550009" });
  assert.equal((await getPreferences(person)).smsOptIn, false, "Changing phone revokes prior SMS consent");
  await updateContact(admin, contactId, { revokeEmail: true });
  assert.equal((await getCrmData()).campaigns.find(c => c.id === emailDraft.id)?.eligibleContacts, 0);
  await savePreferences(person, { ...basePrefs, smsOptIn: false });
  assert.equal((await getCrmData()).campaigns.find(c => c.id === emailDraft.id)?.eligibleContacts, 1);
  assert.ok((await db.select().from(crmConsentEvents).where(eq(crmConsentEvents.contactId, contactId))).length >= 5);
  await deleteCampaign(admin, smsDraft.id);
  await assert.rejects(deleteCampaign(admin, smsDraft.id), /not found/);
  await persist();
  console.log("PASS: consent defaults, real history, case-insensitive deduplication, archive suppression, sync preservation, verified-channel audience, withdrawal/re-consent, phone-change revocation, draft CRUD and notice-version checks. Synthetic fixtures retained for one browser check.");
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
