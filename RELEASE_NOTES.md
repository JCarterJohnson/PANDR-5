# PANDR-5 0.3.0 preview

The exercise library now contains 372 exercises, including 346 additions, with 221 searchable aliases and 26 research sources. Available in the desktop app and at https://pandr-5.vercel.app/.

- Search exercise names, aliases, and equipment in the library and plan editor.
- View setup notes, muscle allocations, evidence confidence, limitations, and citations.
- Added abdominal, oblique, neck, wrist-flexor, and wrist-extensor groups for custom planning.
- Existing exercise IDs, original allocations, default plan, saved histories, and custom JSON imports remain compatible.
- Saved custom records retain their own values. New built-ins become available without overwriting account data; selected exercises are saved with the plan for sync and backups.

- Google sign-in in the system browser, including the native desktop return flow.
- Separate local and account profiles; offline saves, automatic sync after workouts, and explicit conflict reporting.
- Complete CSV export and JSON backups remain available without an account.
- Synced preferences refresh the open Settings form without discarding unsaved edits.
- Source-derived PANDR-5 progression, strict/custom planning, fractional set volume, and recovery guidance.

To bring existing local training into an account, export a JSON backup before signing in, then restore that backup while signed in. Signing in never uploads the local profile automatically.

Catalog verification covers 98 automated tests, desktop/mobile browser flows, import/export/restore, source/default-plan parity, and synchronization through a mocked transport. Google login and live database privacy were verified in 0.2.0. Windows, Linux, and Intel Mac packages are built in CI; their native runtimes have not been tested on those machines.

Fractional credits remain model estimates; confidence describes a muscle's training role, not a validated numerical equivalence. Proposed corrections to original allocations are documented for review and have not been applied. Full research data and limitations are in research/exercise-catalog/ in the repository.

Desktop packages are unsigned. Mobile uses the installable web app. Hosting is currently on free plans with finite quotas; keep backups. GitHub Pages remains a local-only alternative.
