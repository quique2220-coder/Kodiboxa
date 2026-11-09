# KODIBOXA: registrations, ticket payments and room attendance

Apply these checks to registration, checkout, coupons, passes, room planning,
check-in and operational reporting changes.

## Registrations and payments

- Require authenticated, authorized operations and validate event/room relationships.
  Do not admit a pending, failed, unpaid or canceled purchase as a confirmed registration.
- Calculate ticket price, currency, coupon eligibility and discount on the server.
  Do not trust client-submitted totals or a browser checkout-success redirect as
  confirmation that payment succeeded.
- Verify payment webhooks using the provider's supported signature flow and preserve
  any raw-body requirement. Reject invalid signatures without changing admission.
- Protect payment completion, cancellation and webhook replay with idempotency and
  database constraints or transactions. Repeated delivery must not create duplicate
  registrations, consume multiple coupon redemptions or reserve extra seats.
- Check coupon event scope, expiry, usage limits and atomic redemption behavior.
- On checkout failure or expiration, release only the matching reservation. Do not
  free a paid attendee's seat or another order's hold.
- Flag duplicate emails, changing payment state and simultaneous last-seat purchases
  where application-only checks could race.

## Passes and QR codes

- Pass credentials are opaque and case-sensitive. Never uppercase, lowercase,
  truncate or otherwise normalize scanned or pasted credential values.
- Hiding a raw pass hash in the UI must not change the QR payload or invalidate a pass.
- A room entrance QR identifies a room; it does not authenticate the person scanning it.
  Require the attendee's own confirmed registration and validate the matching event.
- Preserve administrative scanning and useful event, schedule and room details on
  participant-facing passes.

## Persistent room counts

- Distinguish event registration, reserved seats, event admission and physical room
  occupancy. Do not infer room attendance from a reservation or a video connection.
- Repeated room check-in must not increment occupancy twice. Repeated exit must not
  decrement twice or produce negative counts.
- Preserve one active room per event registration and unique-visitor semantics when
  someone leaves and returns.
- Room transfers and event exits must release the appropriate previous occupancy
  atomically. Check simultaneous entry/exit requests against durable database state.
- Keep attendance history and reporting intact when editing room/event details.
  Flag destructive replacement of rooms or history without an explicit migration plan.
- Operational attendance totals, capacity and registration counters belong in the
  admin portal. Protect operational reports on the server as well as in the UI.
  Available seats shown during room selection are useful registration information.
- Counts must refresh across operator tabs and survive reload; browser-only counters
  are not a durable source of truth.

## Starting points

Trace changes through `artifacts/api-server/src/lib/ticketing.ts`,
`artifacts/api-server/src/routes/event-commerce.ts`,
`artifacts/api-server/src/lib/room-attendance.ts`,
`artifacts/api-server/src/lib/room-planning.ts` and the associated database constraints.
Do not mutate real provider objects or production attendance records to verify a review.
