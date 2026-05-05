# Project Stock Storage Setup

## Neon shared storage

1. Create a Neon Postgres database.
2. Copy the connection string into `.env.local` as `DATABASE_URL`.
3. Keep `RETENTION_CRON_TOKEN` set if you want to protect the retention cleanup endpoint.
4. Start the app and open `/api/system/storage-status`.
5. Confirm the response shows `"mode":"postgres"` before using the app as shared storage.

Example `.env.local`:

```env
DATABASE_URL=postgresql://user:password@ep-xxxx.ap-southeast-1.aws.neon.tech/project_stock?sslmode=require
RETENTION_CRON_TOKEN=replace-with-a-random-secret
```

Without `DATABASE_URL`, the app falls back to local file storage for local development only.

## Driver Room QR and GPS

- Every active job can now expose a `Driver Room` link and QR code.
- The QR opens `/driver-room?jobId=...` directly so the driver lands on the correct job immediately.
- In `Driver Room`, GPS check-in from the device is required before the operator can start `load` or `deliver` scans.
- GPS comes only from browser geolocation. There is no manual coordinate entry.

## Job history and 100-day archive

- Active jobs stay in `jobs` and active PO rows stay in `po_registry`.
- When a job reaches `completed`, the system moves the final snapshot into:
  - `job_archives`
  - `po_registry_archives`
- After archive succeeds, the completed job is removed from the operational job list.
- Archived jobs are available in `/jobs/history`.
- Archive rows are deleted automatically after 100 days through the shared retention cleanup flow.

## Migrating existing local data

Dry-run to inspect what will be migrated from `data/po-registry.json` and `data/jobs.json`:

```bash
npm run migrate:local-to-db
```

Write the migration to Postgres:

```bash
npm run migrate:local-to-db -- --apply
```

The migration is safe to re-run. It upserts by `registry_key` for `po_registry` and by `id` for `jobs`, and it does not delete or rewrite the local JSON source files.

## Vercel

Add the same `DATABASE_URL` and optional `RETENTION_CRON_TOKEN` values to the Vercel project environment variables. Once the deployment sees `DATABASE_URL`, the app automatically switches from local file storage to shared Postgres mode.
