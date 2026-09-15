# Data, backups, and optional accounts

## Local use

The app works without an account. IndexedDB stores the signed-out profile under `local` and each account under its Supabase user UUID. Signing in or out changes which profile is loaded; it never moves, replaces, or uploads the signed-out profile automatically. Writes use a transaction with strict durability. Storage errors must be shown to the user; a failed save must never be presented as saved. Requesting persistent browser storage reduces eviction risk, but downloadable JSON backups remain important.

The structured backup includes all history, the current workout, the plan, catalog, settings, and recovery check-ins. Import validates schema version 1 and every nested field, ID, number, date, size limit, and plan exercise reference before replacing anything. A future version requires an explicit migration. Maximum JSON input is 50 MB; 100,000 workouts, 100,000 check-ins, and 20,000 catalog exercises are supported.

CSV includes all-time set rows (both completed and unfinished sets), session and exercise snapshots, recorded units, progression recommendations, recovery records, current plan, target volumes, and catalog contributions. `record_type` identifies the row; `record_json` retains the complete corresponding record. Historical records carry their original exercise snapshots even after the plan changes. CSV is for analysis; JSON is the lossless restore format. Spreadsheet formula prefixes are escaped and control characters are represented visibly.

## Exercise catalog import

Use this exact JSON shape. Extra fields are rejected. All exercise content must come from the owner's supplied source; importing does not invent or research exercises.

```json
{
  "schemaVersion": 1,
  "exercises": [
    {
      "id": "owner-stable-exercise-id",
      "name": "Name from your exercise source",
      "equipment": "Equipment from your source",
      "contributions": [
        { "muscle": "Primary muscle name", "coefficient": 1 },
        { "muscle": "Secondary muscle name", "coefficient": 0.5 },
        { "muscle": "Tertiary muscle name", "coefficient": 0.25 }
      ],
      "source": "Your source or citation",
      "beyondFailureAllowed": false
    }
  ]
}
```

Coefficients encode primary (1), secondary (0.5), and tertiary (0.25) roles. Multiple distinct muscles may share any role. Each muscle occurs once per exercise. IDs must be unique; an existing ID or a duplicate name/equipment pair causes the entire import to fail without replacing the catalog. `importExerciseCatalog` returns the combined old and new catalog.

## Connect an account service

1. Use an owner-controlled Supabase project. No paid plan is required by this implementation; review the provider's current free limits before provisioning.
2. Apply `supabase/schema.sql` once in the project's SQL editor. The script creates two private tables and explicit Data API grants. Do not apply it to unrelated tables or use a service key in the app.
3. Enable email/password authentication in Supabase. Set the site's URL and allowed confirmation/reset redirects to the actual deployed HTTPS app URL. Keep email confirmation enabled when distributing the app publicly.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` at build time. Only an `sb_publishable_…` key or legacy JWT with role `anon` is accepted. A secret or service-role key is rejected.
5. Build and redeploy. Without these variables, the account controls should explain that local mode is available and cloud is not configured.
6. Verify two real test accounts before release: owner can read/write their profile; the other account sees no rows and cannot insert/update rows for the owner; a signed-out client receives no table access. Also verify password reset, email confirmation, and logout on the deployed redirect URL.

The SQL is supplied but has not been applied or exercised against a live project in this workspace. Unit tests cover client isolation and conflicts with a mock API; they do not replace database RLS tests.

## Synchronization contract

`getCloudClient()` returns a configured client or null. The UI owns sign-up, sign-in, reset, and sign-out. Before every sync, the client verifies that the current authenticated user is the requested UUID; every request filters by that UUID and the database independently enforces ownership with `auth.uid()`.

On signing in, first call `loadData(user.id)`. If absent, call `readCloudData(user.id)` before creating a starter profile. This downloads that account and atomically saves both its data and baseline. It deliberately refuses to replace an already cached profile. If the account has no cloud profile, initialize and save a fresh account profile. Never initialize an account with the signed-out profile without an explicit user import.

`syncData(user.id, data)` compares local edits with the last successful sync baseline. Independent sessions/check-ins merge by ID. Edits to the same record, concurrent changes to the same metadata field (plan, settings, catalog, current workout), or an unknown baseline with different metadata stop with `SyncConflictError`. No timestamps decide which version wins. Both sides remain intact. When a conflict is reported, export the local JSON, preserve that copy, and review both versions before choosing or manually combining them; there is no destructive automatic resolution.

Workout and check-in revisions are immutable per-record uploads. A profile contains the metadata and a compact manifest of record IDs, version UUIDs, and SHA-256 hashes. Sync downloads only missing or changed records in batches of 100. A conditional update using the previous random profile revision atomically publishes the new manifest. A competing update returns a conflict, preserving the remote revision and local data. Records uploaded before a failed publication remain unreferenced, private versions; retrying is safe. Metadata and manifest transfer grow with history, but full historical workout payloads are not rewritten/downloaded on every sync. The current implementation has no history deletion protocol or garbage collector.

Data and baseline are committed together locally. If a new local edit arrives during network sync, the service preserves the newer local data, advances only the sync baseline, and asks the user to sync again. The UI should pause editing while syncing and only replace its in-memory view after success. If a network response is lost after publication, a retry compares content hashes to recover without duplicating workouts. Never claim background sync while offline.

## References checked September 15, 2026

- [Supabase changelog](https://supabase.com/changelog): reviewed current breaking changes.
- [Explicit Data API grants change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically): grants accompany RLS in the setup script.
- [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security): owner predicates, SELECT for updates, and UPDATE WITH CHECK.
- [API keys](https://supabase.com/docs/guides/getting-started/api-keys): publishable keys in clients; secret keys remain server-side.
- [JavaScript update](https://supabase.com/docs/reference/javascript/update): filtered update with returned rows for optimistic conflict detection.
