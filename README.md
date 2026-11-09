# KODIBOXA by KODELOTH

Hybrid-event application with administrator, presenter and participant interfaces.

## Repository contents

- `artifacts/kodiboxa`: React/Vite application.
- `artifacts/api-server`: Express backend.
- `artifacts/mockup-sandbox`: design previews.
- `lib/db`: PostgreSQL schema and database tooling.
- `lib/api-spec`: OpenAPI source contract.
- `lib/api-client-react` and `lib/api-zod`: generated API clients and validators.
- `.gitar/review`: project-specific, review-only guidance.

This repository contains a source snapshot, not a backup of the running service.
It does not include database records, participant information, object-storage
contents, credentials, original uploads, screenshots or private workspace history.
Application-owned brand images used by the source are included.

## Development

The workspace uses Node.js 24 and pnpm. Install dependencies:

```sh
pnpm install --frozen-lockfile
```

In Replit, run the managed frontend and API workflows defined by the artifact
configuration. The frontend is served at `/` and the API at `/api`; these paths
depend on the artifact router. This source snapshot does not configure a
standalone reverse proxy or provision external services.

Useful commands:

```sh
pnpm --filter @workspace/kodiboxa run dev
pnpm --filter @workspace/api-server run dev
pnpm run typecheck
pnpm --filter @workspace/api-spec run codegen
```

Configure credentials in the hosting environment's secrets manager, never in
source files. Core configuration includes `DATABASE_URL`, Clerk server/browser
keys and `SESSION_SECRET`. Video sessions additionally require `LIVEKIT_URL`,
`LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`. Storage, payments, transcription and
AI features require their corresponding providers and credentials. Replit-managed
connectors and storage authorization are not transferred by cloning this repo.

The database schema and migration source are included, but no database is copied
or provisioned. For an explicitly selected development database, review the schema
before applying:

```sh
pnpm --filter @workspace/db run push
```

Do not run development schema-push commands against production automatically.
Review the existing post-merge script before using it with a new environment.

This is the current development source, including work in progress. The presence
of an API contract or schema declaration does not mean its entire feature is
implemented. Copying the source does not constitute a fresh functional test.

## Gitar activation

The `.gitar/review/` files contain review instructions; they do not install Gitar
or change its organization settings.

1. Sign in at <https://app.gitar.ai>.
2. Connect GitHub and grant Gitar access only to this repository.
3. Enable **Code Review**.
4. Keep **Auto-Apply**, **Auto-Approve** and **Auto-Merge** disabled.
5. Open a pull request, or select **Start Review** for an existing one.
6. Confirm that Gitar posts its review on that pull request.

Only an actual Gitar response confirms that the integration is working.
See the [official setup guide](https://docs.gitar.ai/quickstart).

## Technical monitoring

The server includes privacy-restricted OpenTelemetry exporters for Dash0.
See [monitoring setup, verification and alerting limitations](docs/observability.md).
An ingestion token alone does not create external dashboards or notifications.
