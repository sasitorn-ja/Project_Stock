# Remote API

Load `.env.remote.local` in the consuming server-side process. The file contains
`Stock_API_MODE=remote`, `Stock_API_BASE_URL=https://store.cipcloud.net/syncdrop/api`,
and `Stock_API_TOKEN`. Send `Authorization: Bearer <Stock_API_TOKEN>` on requests.
Append `/jobs`, `/po-registry`, or `/system/token-check` to the base URL.
This environment file is for the API consumer; the existing browser UI uses SSO.
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
