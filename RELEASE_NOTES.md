# PANDR-5 0.2.0 preview

Google accounts and cross-device synchronization are now available in the desktop app and at https://pandr-5.vercel.app/.

- Google sign-in in the system browser, including the native desktop return flow.
- Separate local and account profiles; offline saves, automatic sync after workouts, and explicit conflict reporting.
- Complete CSV export and JSON backups remain available without an account.
- Synced preferences refresh the open Settings form without discarding unsaved edits.
- Source-derived PANDR-5 progression, strict/custom planning, fractional set volume, and recovery guidance.

To bring existing local training into an account, export a JSON backup before signing in, then restore that backup while signed in. Signing in never uploads the local profile automatically.

Verified: 88 automated tests, production build, live database ownership/isolation checks, web and macOS ARM64 Google login, desktop session persistence, web-to-desktop unfinished-workout sync, preference sync, and native CSV export. Windows, Linux, and Intel Mac packages are built in CI; their native runtimes have not been tested on those machines.

The exercise library contains only the original spreadsheet's movements. The owner's expanded dataset can be imported later.

Desktop packages are unsigned. Mobile uses the installable web app. Hosting is currently on free plans with finite quotas; keep backups. GitHub Pages remains a local-only alternative.
