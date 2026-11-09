import { pgTable, text, integer } from "drizzle-orm/pg-core";
import { events } from "./events";
import { users } from "./users";
import { rooms } from "./sessions";

// Application reservations and relationships only. Stripe owns all prices,
// products, coupons, payment amounts and payment-provider records.
export const ticketOrders = pgTable("ticket_orders", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "restrict" }),
  userId: text("user_id").notNull().references(() => users.id),
  roomId: text("room_id").references(() => rooms.id, { onDelete: "restrict" }),
  checkoutSessionId: text("checkout_session_id").unique(),
  stripePriceId: text("stripe_price_id").notNull().default(""),
  promotionCodeId: text("promotion_code_id"),
  registrationId: text("registration_id"),
  status: text("status").notNull().default("pending"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const mediaUploads = pgTable("media_uploads", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  objectPath: text("object_path").notNull().unique(),
  status: text("status").notNull().default("pending"),
  size: integer("size").notNull(),
});
