# KODIBOXA: API contracts, persistence and change completeness

Apply these checks when a change crosses frontend, API, database or generated-client
boundaries, or affects persisted navigation and real-time updates.

## Contract consistency

- Treat `lib/api-spec/openapi.yaml` as the API contract. A changed endpoint needs
  matching request validation, response validation and generated client/schema updates.
- Do not hand-edit generated files to conceal a missing contract update.
- Trace the actual frontend request: body shape, path parameters, identifiers,
  null versus omitted values, dates and response envelope must match the server.
- Derive identities, permissions, prices and other server-owned fields on the server.
- Validate parameters and bodies before use. Return explicit non-success statuses for
  forbidden actions, invalid state and provider failures; do not return fake success.
- A backend capability without a working UI, or a UI calling an absent endpoint, is
  incomplete. Flag it without assuming that a schema declaration is an implementation.
- Preserve artifact base paths for browser-visible API and navigation URLs. Do not
  introduce hardcoded localhost or development-domain calls into application code.

## Durable and concurrent state

- Persistence includes saving, returning the real result, refreshing the caller and
  making changes visible to other authorized users.
- Check reloads, navigation between tabs and sign-out/sign-in. Event selection must
  remain associated with the correct event rather than silently changing to a default.
- User-specific cached data must not leak across identity changes.
- Refetch intervals, invalidation or real-time subscriptions must keep cross-user
  state fresh without recreating a media room or discarding in-progress form input.
- Audit stale asynchronous completions after leave, cancellation, session changes or
  Stop/Start. An old request must not overwrite a newer session's state.
- Use transactions and uniqueness constraints for concurrency-sensitive invariants;
  a read-then-write check outside a transaction is not sufficient on its own.
- If voluntary polls are added, one attendee's retry or answer change must not create
  multiple votes. Closed prompts must reject late answers, and organizer-only response
  details must not be returned to ordinary attendees.

## Schema and verification

- Preserve the existing database. Flag destructive changes, loss of history and
  missing foreign-key/uniqueness handling.
- New table declarations are not evidence that the running database was updated.
  Confirm the development schema and documented deployment path without writing to
  production during review.
- Do not add application-startup production DDL or automatic destructive migrations.
- Recommend the smallest relevant verification. Existing useful checks include:
  `pnpm run typecheck:libs`, artifact type checks and focused domain tests.
- Report exactly what was verified. Passing type checks, mocked API responses or
  static screenshots do not prove a complete authenticated multi-user workflow.
- Do not request broad rewrites or dependency migrations merely to satisfy a style preference.

## Starting points

Inspect `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`, `lib/db/src/schema`,
the changed API route and all relevant frontend callers.
