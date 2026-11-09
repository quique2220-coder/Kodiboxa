# KODIBOXA by KODELOTH

A persistent hybrid-event platform with administrator, presenter and participant experiences.

## Run & Operate

- `artifacts/kodiboxa: web` — managed React/Vite frontend at `/`.
- `artifacts/api-server: API Server` — managed Express backend at `/api`.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate typed API hooks and Zod schemas.
- `pnpm run typecheck` — workspace TypeScript check.
- `pnpm --filter @workspace/db run push` — apply development database schema.
- `pnpm --filter @workspace/db exec drizzle-kit generate --config ./drizzle.config.ts` — record schema migrations.
- Replit's Publish flow manages production schema changes. Never add startup-time DDL.

## Architecture decisions

- TypeScript/Express rather than FastAPI: the provided monorepo already supplies a supported Express server, shared types, Zod validation, Drizzle/PostgreSQL and artifact routing. Keeping one language avoids extra infrastructure and prioritizes a working product.
- Clerk owns authentication; application database roles own authorization. New accounts are participants. A verified email matching owner-configured `KODIBOXA_ADMIN_EMAIL` gets a one-time bootstrap admin grant. Subsequent role changes do not silently restore revoked privileges.
- All mutations run through a validated command API, with server authorization, transactional audit entries and serialized capacity/scheduling checks.
- Workspace snapshots are role-filtered by the server. Anonymous visitors see only designated example events, not private operational records or personal passes. The UI polls for updates every five seconds.
- The SRE demonstration measures an isolated timer service. Detection and analysis are deterministic rules, not a connected AI model. Only the fixed `RESET_DEMO_DELAY` action is possible and requires administrator approval. No system commands are executed.
- Phase 3 adapters are capability contracts only. No media, translation, Ollama, telemetry or SimpleX connection is claimed.

## Where things live

- `lib/api-spec/openapi.yaml` — API contract.
- `lib/db/src/schema/` — users, events, rooms, sessions, registrations, attendance, questions, announcements, audit and incidents.
- `lib/db/drizzle/` — recorded SQL migrations.
- `artifacts/api-server/src/lib/commands.ts` — transactional workflow logic.
- `artifacts/api-server/src/lib/providers.ts` — future provider interfaces.
- `artifacts/api-server/src/lib/platform.ts` — truthful integration statuses and isolated demo measurements.
- `artifacts/kodiboxa/src/` — branded UI, authentication, role-aware screens.

## Product scope and constraints

- The uploaded brief prioritizes Phase 1 first, then the isolated SRE demonstration. Do not block the core on Phase 3 credentials.
- Meetings are private by default. Private events never show sponsors.
- Never fabricate operational metrics or present planned capabilities as functioning.
- Presenter consent is required for remote slide control and can be revoked immediately; never remotely activate a microphone.
- English is primary; preserve localization-ready architecture for Spanish and further languages.
- Use targeted checks for changed features. Do not repeatedly test unchanged behavior or run independent review cycles without a critical need.

## Initial preview data

Three explicitly labeled example events and sessions are stored in development PostgreSQL. Attendance and registration counts start at zero and are calculated from actual records. Production does not automatically receive development example records.

## Remaining advanced scope

Live video, real-time translation, external Ollama inference, SimpleX, monitoring connectors, calendar integration, reminders, transcripts, meeting summaries, polls/quizzes, and consent-based remote presentation control require further implementation and configured/tested providers.
