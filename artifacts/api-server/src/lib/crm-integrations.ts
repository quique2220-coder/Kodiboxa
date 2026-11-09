import { createDecipheriv, createCipheriv, randomBytes, hkdfSync, randomUUID, createHash } from "node:crypto";
import { Pool, db, crmIntegrations, crmZapierExports, users } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { fail } from "./auth";
import { crmAudit, crmWrite } from "./crm-contacts";
import { getCrmData } from "./crm-campaigns";

type User = typeof users.$inferSelect;
type Provider = "neon" | "zapier";
function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) fail(503, "Secure integration storage is not configured");
  return Buffer.from(hkdfSync("sha256", secret, "KODIBOXA-integration-key-v1", "AES-256-GCM", 32));
}
function seal(value: string) {
  const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), nonce);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { encryptedCredential: encrypted.toString("base64url"), nonce: nonce.toString("base64url"), authenticationTag: cipher.getAuthTag().toString("base64url") };
}
function open(encrypted: typeof crmIntegrations.$inferSelect) {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(encrypted.nonce, "base64url"));
    decipher.setAuthTag(Buffer.from(encrypted.authenticationTag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted.encryptedCredential, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    fail(503, "Integration credentials could not be decrypted. Reconnect this integration.");
  }
}
export function validateNeonConnectionString(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { fail(400, "Enter a valid Neon PostgreSQL connection string"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname.startsWith("ep-") || !url.hostname.endsWith(".neon.tech") ||
      (url.port && url.port !== "5432") || !url.username || !url.password || (url.searchParams.has("sslmode") && url.searchParams.get("sslmode") === "disable")) {
    fail(400, "Connect a Neon PostgreSQL endpoint using SSL on port 5432");
  }
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
export function validateZapierHookUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { fail(400, "Enter a valid Zapier Catch Hook URL"); }
  if (url.protocol !== "https:" || url.hostname !== "hooks.zapier.com" || !/^\/hooks\/catch\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) || url.username || url.password) {
    fail(400, "Use an HTTPS Zapier Catch Hook URL");
  }
  return url.toString();
}
async function save(user: User, provider: Provider, credential: string) {
  const encrypted = seal(credential);
  await crmWrite(async tx => {
    await tx.insert(crmIntegrations).values({ id: randomUUID(), provider, ...encrypted, connectedBy: user.id, verifiedAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: crmIntegrations.provider, set: { ...encrypted, connectedBy: user.id, verifiedAt: new Date().toISOString(), lastSyncedAt: null } });
    await crmAudit(tx, user, `crm_${provider}_connect`, `Administrator connected ${provider}; CRM data has not been synced`);
  });
  return { id: provider, message: `${provider === "neon" ? "Neon" : "Zapier"} connection verified and saved. No contact data has been sent.` };
}
export async function connectNeon(user: User, raw: string) {
  const connectionString = validateNeonConnectionString(raw);
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: true }, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  try { await pool.query("SELECT 1"); } catch {
    fail(400, "Could not connect to that Neon database. Check its endpoint, password, network access and SSL settings.");
  } finally { await pool.end(); }
  return save(user, "neon", connectionString);
}
async function credential(provider: Provider) {
  const [record] = await db.select().from(crmIntegrations).where(eq(crmIntegrations.provider, provider));
  if (!record) fail(409, `${provider === "neon" ? "Neon" : "Zapier"} is not connected`);
  return { record, value: open(record) };
}
export async function integrationStatus() {
  const records = await db.select().from(crmIntegrations);
  return { integrations: (["neon", "zapier"] as Provider[]).map(provider => {
    const record = records.find(r => r.provider === provider);
    return {
      provider, connected: Boolean(record), verifiedAt: record ? new Date(record.verifiedAt).toISOString() : null,
      lastSyncedAt: record?.lastSyncedAt ? new Date(record.lastSyncedAt).toISOString() : null,
    };
  }) };
}
export async function disconnect(user: User, provider: Provider) {
  const removed = await crmWrite(async tx => {
    const rows = await tx.delete(crmIntegrations).where(eq(crmIntegrations.provider, provider)).returning({ id: crmIntegrations.id });
    if (rows.length) await crmAudit(tx, user, `crm_${provider}_disconnect`, `Administrator removed ${provider} credentials; third-party data retained`);
    return rows.length;
  });
  return { id: provider, message: removed ? "Connection removed. Data already sent remains in the external account." : "Integration was already disconnected." };
}
async function sendZapier(payload: Record<string, unknown>) {
  const { value: hookUrl } = await credential("zapier");
  try {
    const response = await fetch(hookUrl, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(7000),
      headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!response.ok) fail(502, `Zapier returned HTTP ${response.status}. No contacts were synchronized.`);
  } catch (error) {
    if (error && typeof error === "object" && "status" in error) throw error;
    fail(502, "Could not reach the Zapier Catch Hook. Check the connection and try again.");
  }
}
export async function connectZapier(user: User, raw: string) {
  const hookUrl = validateZapierHookUrl(raw);
  try {
    const response = await fetch(hookUrl, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(7000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "kodiboxa.connection_test", source: "KODIBOXA", test: true }),
    });
    if (!response.ok) fail(400, `Zapier returned HTTP ${response.status}. Check that this Catch Hook is active.`);
  } catch (error) {
    if (error && typeof error === "object" && "status" in error) throw error;
    fail(400, "Could not reach this Zapier Catch Hook. Verify the URL and try again.");
  }
  return save(user, "zapier", hookUrl);
}
export async function testZapier() {
  await sendZapier({ event: "kodiboxa.connection_test", source: "KODIBOXA", test: true });
  return { id: "zapier", message: "A test event with no attendee data reached Zapier." };
}
export async function syncZapier(user: User) {
  const crm = await getCrmData();
  const current = crm.contacts.flatMap(contact => {
    const common = { contactId: contact.id, name: contact.name, company: contact.company, tags: contact.tags, eventHistory: contact.history };
    const results = [];
    if (!contact.archived && contact.emailOptIn && contact.emailVerified) {
      results.push({ channel: "email", destination: contact.email, ...common, consentAt: contact.emailConsentAt, destinationHash: createHash("sha256").update(contact.email).digest("hex") });
    }
    if (!contact.archived && contact.smsOptIn && contact.phoneVerified && contact.phone) {
      results.push({ channel: "sms", destination: contact.phone, ...common, consentAt: contact.smsConsentAt, destinationHash: createHash("sha256").update(contact.phone).digest("hex") });
    }
    return results;
  });
  current.sort((a,b) => `${a.contactId}:${a.channel}`.localeCompare(`${b.contactId}:${b.channel}`));
  const [zapierRecord] = await db.select().from(crmIntegrations).where(eq(crmIntegrations.provider, "zapier"));
  if (!zapierRecord) fail(409, "Zapier is not connected");
  const previous = await db.select().from(crmZapierExports);
  const eligibleKeys = new Set(current.map(c => `${c.contactId}:${c.channel}`));
  const suppressed = previous.filter(x => !eligibleKeys.has(`${x.contactId}:${x.channel}`))
    .map(x => ({ contactId: x.contactId, channel: x.channel, action: "suppression", previousDestinationHash: x.destinationHash, reason: "Consent was withdrawn or the contact is no longer eligible." }))
    .sort((a,b) => `${a.contactId}:${a.channel}`.localeCompare(`${b.contactId}:${b.channel}`));
  if (!current.length && !suppressed.length) fail(409, "No opted-in verified contacts or earlier Zapier records need updating. No data was sent.");
  const contacts = current.map(({ destinationHash: _hash, ...contact }) => ({ action: "upsert", ...contact }));
  const state = JSON.stringify({ contacts, suppressed });
  const syncBatchId = createHash("sha256").update(state).digest("hex");
  if (zapierRecord.lastSyncHash && zapierRecord.lastSyncHash === syncBatchId) {
    return { id: "zapier", message: "Zapier already has this CRM snapshot; no duplicate event was sent." };
  }
  await sendZapier({ event: "kodiboxa.crm_sync", source: "KODIBOXA", syncBatchId, sentAt: new Date().toISOString(), contacts, suppressed });
  const now = new Date().toISOString();
  await crmWrite(async tx => {
    await tx.delete(crmZapierExports);
    for (const destination of current) {
      await tx.insert(crmZapierExports).values({
        contactId: destination.contactId, channel: destination.channel,
        destinationHash: destination.destinationHash, updatedAt: now,
      });
    }
    await tx.update(crmIntegrations).set({ lastSyncedAt: now, lastSyncHash: syncBatchId }).where(eq(crmIntegrations.provider, "zapier"));
    await crmAudit(tx, user, "crm_zapier_sync",
      `${contacts.length} consented, verified destinations synchronized and ${suppressed.length} earlier records suppressed; no marketing messages were sent`);
  });
  return { id: "zapier", message: `${contacts.length} consented, verified destinations synchronized; ${suppressed.length} earlier records suppressed. No messages were sent.` };
}
type RemoteContact = Awaited<ReturnType<typeof getCrmData>>["contacts"][number];
async function ensureNeonTables(pool: Pool) {
  await pool.query("CREATE SCHEMA IF NOT EXISTS kodiboxa_crm");
  await pool.query(`CREATE TABLE IF NOT EXISTS kodiboxa_crm.contacts (
    id text PRIMARY KEY, name text NOT NULL, email text NOT NULL, phone text NOT NULL DEFAULT '',
    company text NOT NULL DEFAULT '', tags text[] NOT NULL DEFAULT '{}', source text NOT NULL,
    archived boolean NOT NULL, email_opt_in boolean NOT NULL, sms_opt_in boolean NOT NULL,
    email_verified boolean NOT NULL, phone_verified boolean NOT NULL, email_consent_at timestamptz,
    sms_consent_at timestamptz, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS kodiboxa_crm.event_history (
    contact_id text NOT NULL REFERENCES kodiboxa_crm.contacts(id) ON DELETE CASCADE,
    event_id text NOT NULL, title text NOT NULL, starts_at timestamptz NOT NULL, attended boolean NOT NULL,
    PRIMARY KEY(contact_id, event_id)
  )`);
}
export async function syncNeon(user: User) {
  const { record, value } = await credential("neon");
  const pool = new Pool({ connectionString: value, ssl: { rejectUnauthorized: true }, max: 2, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  let contactCount = 0, historyCount = 0;
  const client = await pool.connect().catch(() => null);
  if (!client) { await pool.end(); fail(502, "Could not connect to Neon. CRM data was not synced."); }
  try {
    await client.query("BEGIN");
    await ensureNeonTables(pool);
    const crm = await getCrmData();
    const remoteCount = await client.query<{ count: string }>("SELECT count(*) FROM kodiboxa_crm.contacts");
    if (crm.contacts.length === 0 && Number(remoteCount.rows[0]?.count ?? "0") > 0) fail(409, "KODIBOXA returned no contacts; existing Neon mirror was preserved.");
    for (const contact of crm.contacts) {
      await client.query(`INSERT INTO kodiboxa_crm.contacts
        (id,name,email,phone,company,tags,source,archived,email_opt_in,sms_opt_in,email_verified,phone_verified,email_consent_at,sms_consent_at,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,phone=EXCLUDED.phone,
        company=EXCLUDED.company,tags=EXCLUDED.tags,source=EXCLUDED.source,archived=EXCLUDED.archived,
        email_opt_in=EXCLUDED.email_opt_in,sms_opt_in=EXCLUDED.sms_opt_in,email_verified=EXCLUDED.email_verified,
        phone_verified=EXCLUDED.phone_verified,email_consent_at=EXCLUDED.email_consent_at,
        sms_consent_at=EXCLUDED.sms_consent_at,updated_at=EXCLUDED.updated_at`,
      [contact.id,contact.name,contact.email,contact.phone,contact.company,contact.tags,contact.source,contact.archived,
        contact.emailOptIn,contact.smsOptIn,contact.emailVerified,contact.phoneVerified,contact.emailConsentAt,
        contact.smsConsentAt,contact.createdAt,contact.updatedAt]);
      contactCount++;
      const uniqueHistory = new Map<string, RemoteContact["history"][number]>();
      for (const h of contact.history) uniqueHistory.set(h.eventId, { ...h, attended: h.attended || (uniqueHistory.get(h.eventId)?.attended ?? false) });
      for (const h of uniqueHistory.values()) {
        await client.query(`INSERT INTO kodiboxa_crm.event_history(contact_id,event_id,title,starts_at,attended)
          VALUES ($1,$2,$3,$4,$5) ON CONFLICT(contact_id,event_id)
          DO UPDATE SET title=EXCLUDED.title,starts_at=EXCLUDED.starts_at,attended=EXCLUDED.attended`,
        [contact.id,h.eventId,h.title,h.startsAt,h.attended]);
        historyCount++;
      }
    }
    await client.query(`DELETE FROM kodiboxa_crm.event_history h
      WHERE NOT EXISTS (SELECT 1 FROM kodiboxa_crm.contacts c WHERE c.id=h.contact_id)
        OR NOT EXISTS (SELECT 1 FROM (SELECT jsonb_array_elements($1::jsonb) AS record) latest
          WHERE latest.record->>'id'=h.contact_id
            AND EXISTS (SELECT 1 FROM jsonb_array_elements(latest.record->'history') item WHERE item->>'eventId'=h.event_id))`, [JSON.stringify(crm.contacts.map(c => ({ id: c.id, history: c.history })))]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error && typeof error === "object" && "status" in error) throw error;
    fail(502, "The Neon sync failed. No partial CRM update was saved.");
  } finally {
    client.release();
    await pool.end();
  }
  await crmWrite(async tx => {
    await tx.update(crmIntegrations).set({ lastSyncedAt: new Date().toISOString() }).where(eq(crmIntegrations.id, record.id));
    await crmAudit(tx, user, "crm_neon_sync", `${contactCount} CRM records and ${historyCount} event-history rows synchronized`);
  });
  return { id: "neon", message: `${contactCount} CRM records and ${historyCount} event-history rows synced. Organizer notes, campaign drafts and payment data were excluded.` };
}
