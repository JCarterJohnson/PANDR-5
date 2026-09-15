# PANDR-5 app implementation

All files live in App. Source of truth: source/live-sheet.json (live Guide Sheet, Blank Fillout read 2026-09-15), supplied CSVs. No external exercise research or invented RP algorithms.

Architecture: React + TypeScript + Vite installable PWA, Electron desktop download, IndexedDB local persistence, optional Supabase account auth and per-user cloud sync. Free static distribution with GitHub Pages and desktop GitHub Releases. Offline use and backups remain available without cloud. No paid services or new costs permitted.

Work streams: domain engine + source seed and tests; persistence/export/account sync and SQL; packaging/PWA/release tooling; root owns UI/integration and browser QA.

Product: Train (seven-day strip, current exercise plan, logging), Plan (exercise swaps, sets, rep ranges, RIR, target volume), History (sessions and trends), Library (search source lifts, import owner-supplied data), Settings (strict/custom, units, start date, progression percentages, accounts, backup/export/install), Method (traceable rules).

Decisions: targets apply to selected muscles (default major primary muscles); secondary muscles are reported, not each independently forced to 10. Original prescription is preserved as a source template, and strict activation requires valid FSA bounds. Integer set allocation attempts to approximate requested targets while respecting 10-20 hard bounds; infeasibility is explicit. Pivot weeks are temporary exceptions, not permanent changes to base plan. No invented readiness score or volume ramp. FSA coefficients are approximations and follow spreadsheet formulas, including all roles present. Existing source lifts are allowed; broad exercise catalog awaits owner.

Verification: source parity, progression boundary/finisher/assisted cases, allocator/constraints, persistence round trip, CSV injection protection, account isolation/sync conflicts, build, desktop packaging, desktop/mobile UI, reload and offline.
