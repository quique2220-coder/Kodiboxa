import { randomUUID } from "node:crypto";
import { db, crmContacts, crmCampaigns, registrations, checkins, events, users } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { CreateCrmCampaignBody } from "@workspace/api-zod";
import { crmAudit, crmWrite } from "./crm-contacts";
import { fail } from "./auth";

type User = typeof users.$inferSelect;
export async function getCrmData() {
  return db.transaction(async tx => {
    const contacts = await tx.select().from(crmContacts).orderBy(desc(crmContacts.updatedAt));
    const campaigns = await tx.select().from(crmCampaigns).orderBy(desc(crmCampaigns.updatedAt));
    const rows = await tx.select({ registration: registrations, event: events }).from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId)).where(eq(events.example, false));
    const entered = await tx.select({ registrationId: checkins.registrationId }).from(checkins).where(eq(checkins.action, "check_in"));
    const attendedIds = new Set(entered.map(x => x.registrationId));
    const contactRows = contacts.map(c => ({
      ...c, createdAt: new Date(c.createdAt).toISOString(), updatedAt: new Date(c.updatedAt).toISOString(),
      emailConsentAt: c.emailConsentAt ? new Date(c.emailConsentAt).toISOString() : null,
      smsConsentAt: c.smsConsentAt ? new Date(c.smsConsentAt).toISOString() : null,
      history: rows.filter(({ registration: r }) => r.email.toLowerCase() === c.email || (c.userId && r.userId === c.userId))
        .map(({ registration: r, event: e }) => ({
          eventId: e.id, title: e.title, startsAt: e.startsAt, attended: r.checkedIn || attendedIds.has(r.id),
        })).sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    }));
    return {
      contacts: contactRows,
      campaigns: campaigns.map(c => {
        const matching = contactRows.filter(x => !x.archived && (!c.tag || x.tags.includes(c.tag)) &&
          (!c.audienceEventId || x.history.some(h => h.eventId === c.audienceEventId)));
        const eligible = matching.filter(x => c.channel === "email" ? x.emailOptIn && x.emailVerified : x.smsOptIn && x.phoneVerified && Boolean(x.phone));
        return {
          ...c, updatedAt: new Date(c.updatedAt).toISOString(),
          matchingContacts: matching.length, eligibleContacts: eligible.length, excludedContacts: matching.length - eligible.length,
        };
      }),
      emailReady: false, smsReady: false,
      deliveryReason: "Email and SMS providers are not connected. Campaigns are drafts only; nothing can be sent or scheduled. SMS also requires phone verification.",
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
export async function saveCampaign(user: User, input: ReturnType<typeof CreateCrmCampaignBody.parse>, id?: string) {
  return crmWrite(async tx => {
    const name = input.name.trim();
    if (!name) fail(400, "Campaign name is required");
    const [old] = id ? await tx.select().from(crmCampaigns).where(eq(crmCampaigns.id, id)) : [];
    if (id && !old) fail(404, "Draft not found");
    for (const [field, eventId] of [["promoted", input.promotedEventId], ["audience", input.audienceEventId]] as const) {
      if (!eventId) continue;
      const [event] = await tx.select({ id: events.id }).from(events).where(eq(events.id, eventId!));
      // An unchanged deleted audience remains a restrictive, empty segment.
      if (!event && !(field === "audience" && eventId === old?.audienceEventId)) fail(400, "Selected event is no longer available");
    }
    const values = {
      name, channel: input.channel, subject: input.subject.trim(), body: input.body,
      promotedEventId: input.promotedEventId || null, audienceEventId: input.audienceEventId || null,
      tag: input.tag?.trim().toLowerCase() || "", status: "draft", updatedAt: new Date().toISOString(),
    };
    const draftId = id || randomUUID();
    if (old) await tx.update(crmCampaigns).set(values).where(eq(crmCampaigns.id, draftId));
    else await tx.insert(crmCampaigns).values({ id: draftId, ...values });
    await crmAudit(tx, user, "crm_campaign_save", `Draft ${draftId} saved; no delivery scheduled`);
    return { id: draftId, message: "Campaign draft saved. No messages were sent." };
  });
}
export async function deleteCampaign(user: User, id: string) {
  return crmWrite(async tx => {
    const [removed] = await tx.delete(crmCampaigns).where(eq(crmCampaigns.id, id)).returning({ id: crmCampaigns.id });
    if (!removed) fail(404, "Draft not found");
    await crmAudit(tx, user, "crm_campaign_delete", `Draft ${id} deleted; contacts unchanged`);
    return { id, message: "Draft deleted" };
  });
}
