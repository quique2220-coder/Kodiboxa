import { clerkClient, getAuth } from "@clerk/express";
import type { Request } from "express";
import { db, users, registrations } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
export function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
export async function currentUser(req: Request) {
  const { userId } = getAuth(req);
  if (!userId) return null;
  let [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    const identity = await clerkClient.users.getUser(userId);
    const address = identity.emailAddresses.find(e => e.id === identity.primaryEmailAddressId);
    if (!address || address.verification?.status !== "verified") fail(403, "Verify your primary email before accessing KODIBOXA.");
    const email = address.emailAddress.toLowerCase();
    const name = [identity.firstName, identity.lastName].filter(Boolean).join(" ") || email.split("@")[0];
    const owner = process.env.KODIBOXA_ADMIN_EMAIL?.toLowerCase().trim();
    [user] = await db.insert(users).values({
      id: userId, email, name, role: owner === email ? "admin" : "participant",
      bootstrapGranted: owner === email ? "yes" : "no",
    }).onConflictDoNothing().returning();
    if (!user) [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) fail(409, "This email is already associated with a different identity. Contact the administrator.");
  }
  // A configured bootstrap grant happens once, never restoring a revoked role.
  if (user.bootstrapGranted === "no" && process.env.KODIBOXA_ADMIN_EMAIL?.toLowerCase().trim() === user.email) {
    [user] = await db.update(users).set({ role: "admin", bootstrapGranted: "yes" }).where(and(eq(users.id, user.id), eq(users.bootstrapGranted, "no"))).returning();
    if (!user) [user] = await db.select().from(users).where(eq(users.id, userId));
  }
  await db.update(registrations).set({ userId }).where(and(eq(registrations.email, user!.email), isNull(registrations.userId)));
  return user!;
}
