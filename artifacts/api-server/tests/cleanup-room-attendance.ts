import { readFile, unlink } from "node:fs/promises";
import { clerkClient } from "@clerk/express";
import { db, users, events, auditLogs } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { execute } from "../src/lib/commands";

async function main() {
  if (process.env.NODE_ENV === "production" || !process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")) throw new Error("Development-only cleanup");
  const fixture = JSON.parse(await readFile("/tmp/room-attendance-fixture.json", "utf8"));
  const accounts = fixture.accounts as { id: string; email: string }[];
  if (!accounts.length || !accounts.every(a => /^rooms-\d+-[a-f0-9]+\+clerk_test@example\.com$/.test(a.email))) throw new Error("Non-fixture accounts refused");
  const people = await db.select().from(users).where(inArray(users.id, accounts.map(a => a.id)));
  const admin = people.find(p => p.role === "admin");
  if (!admin || !people.every(p => p.name.startsWith(`Room verification ${fixture.key} `))) throw new Error("Fixture ownership could not be verified");
  // Additional IDs must come from the test report, not a broad title search.
  const additional = process.argv.filter(a => a.startsWith("--event=")).map(a => a.slice(8));
  const ids = [...new Set<string>([...fixture.eventIds, ...additional])];
  const records = await db.select().from(events).where(inArray(events.id, ids));
  if (!records.every(e => !e.stripePriceId && (e.title.startsWith(`[Room verification ${fixture.key}]`) || /^\[?Room UI [A-Za-z0-9_-]+\]?$/.test(e.title)))) throw new Error("Non-fixture or paid events refused");
  for (const event of records) await execute(admin, { action: "delete_event", id: event.id });
  await db.delete(auditLogs).where(inArray(auditLogs.actor, people.map(p => p.name)));
  await db.delete(users).where(inArray(users.id, accounts.map(a => a.id)));
  for (const account of accounts) await clerkClient.users.deleteUser(account.id);
  await unlink("/tmp/room-attendance-fixture.json");
  console.log("Temporary room test events, attendance, schedules, audit entries and synthetic accounts removed.");
}
main().then(() => process.exit(0)).catch(error => { console.error({ cleanupFailed: true, message: error.message }); process.exit(1); });
