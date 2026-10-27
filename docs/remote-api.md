# Remote API

For a developer running this web app on their own machine:

1. Pull the latest `Release` branch and run `npm ci`.
2. Put the supplied `.env.remote.local` in the project root (do not commit it).
3. Stop the old dev process and run `npm run dev` (or explicitly `npm run dev:remote`).
4. Open `http://localhost:3000/`.

`npm run dev` detects `.env.remote.local` and loads remote mode automatically.
`npm run dev:remote` requires that file explicitly. Both check the token and bind
the remote development server to `127.0.0.1`. Without `.env.remote.local`,
`npm run dev` keeps the normal SSO flow. The remote settings take precedence over
a legacy `.env.local` with client ID `sync-drop`.

Remote development uses the token in the local Node process. Local browser API
requests go through an endpoint allowlist on that process; server-rendered job
pages also load through the remote API. The browser never receives the token.
Remote mode is only active with `NODE_ENV=development`, accepts loopback and
same-origin requests, and does not register or change any SSO clients. Stop the
dev process to end local access. Production continues to use normal SSO.

For other server-side API consumers, load `.env.remote.local`. The file contains
`Stock_API_MODE=remote`, `Stock_API_BASE_URL=https://store.cipcloud.net/syncdrop/api`,
and `Stock_API_TOKEN`. Send `Authorization: Bearer <Stock_API_TOKEN>` on requests.
Append `/jobs`, `/po-registry`, or `/system/token-check` to the base URL.
Do not put the token in browser code, URLs, logs, or Git.

Production reads `Stock_API_TOKEN` and `Stock_API_WRITE_ENABLED=true` at runtime
from `/opt/syncdrop/.env.production`. Without the write flag, authenticated reads
work and POST/PUT/PATCH/DELETE return 403. A missing or invalid token returns 401
on protected endpoints. Existing SSO and QR driver flows continue to work;
explicit invalid API credentials cannot fall through to those flows.

The token covers jobs, PO registry, job report export, storage status, and the
token diagnostic. It does not grant retention/cleanup or authentication access.
Business routes still support only the methods they implement (for example,
jobs currently has no PUT handler).

## Checks without accessing storage

- `GET /system/health`: public application liveness, not database readiness.
- `GET /system/token-check`: checks read access and reports token capabilities.
- `POST`, `PUT`, `PATCH`, `DELETE /system/token-check`: check the same write
  policy as business endpoints and return `storageAccessed: false`.

Run `node scripts/check-remote-api.mjs` after loading `.env.remote.local`.
The script reads that file by default and never prints its token. It checks
health, authorized methods, and rejected missing/invalid credentials. These
checks verify authentication and authorization only; they do not prove business
data can be changed. They never call business data handlers.

Deploy through the existing Release workflow after updating the production env.
Recreate only `syncdrop`; do not run migrations, volume cleanup, or compose down.
