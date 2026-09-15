# PANDR-5

An offline training app built from the PANDR-5 v1.1.1 spreadsheet. Choose a plan, log your working sets, and get a clear explanation of the next session’s load.

## Current release

**0.1.0 is a preview.** Local saving, workout progression, planning, recovery, history, backups, and exports are functional. Cloud account integration is implemented, but the public preview has no live account service configured. It currently saves on each device. Use a JSON backup to move your full history between devices.

- Desktop downloads: use the assets on this repository’s Releases page.
- Phone or desktop browser: use the GitHub Pages app, then install it from your browser. The Pages build is local-only.
- Windows/macOS packages are unsigned. They do not have paid code-signing or Apple notarization. Review the source and download only from this repository; operating systems may display security warnings. Do not disable system security protections globally.
- No domain purchase, subscription, analytics, advertising, or paid API is needed for local use.

## Features

- Original Push / Pull / Legs / recovery / Upper / Lower / recovery template.
- One working load per exercise, set-level reps and RIR, resumable sessions, and a rest timer.
- Progression from the prescribed anchor: final normal set, or the set before a beyond-failure finisher.
- Model-based 2–5% increases and 2–3% reductions, with equipment increment checks and assisted/bodyweight handling.
- Full and fractional muscle credits from the original sheet’s live formulas.
- Selected 10–20 weekly effective-set targets, integer set allocation, strict split/order checks, and a custom-mode switch.
- Weekly recovery check-ins and a temporary half-set pivot after multiple flags.
- Searchable source exercise catalog; validated import for the owner-supplied expanded dataset.
- All-time CSV export plus lossless JSON backup/restore.
- Optional Supabase account authentication and optimistic, per-user cloud synchronization with conflict detection.

The initial strict plan adds one lateral-raise set so the selected lateral-delt target reaches 10; the source template remains preserved separately. The app does not invent RP-style volume escalation, readiness scores, or proprietary formulas.

## Run locally

Install Node.js 24 or newer, then:

```sh
npm ci
npm run dev
```

For a built desktop app from source:

```sh
npm run build
npm run desktop
```

Double-click `scripts/launch-mac.command` or `scripts/launch-windows.cmd` after installing Node.js for the launcher. The launcher installs missing dependencies and builds the app before opening Electron. The mobile web app requires an HTTPS static host or localhost.

## Verify and package

```sh
npm run check
npm run desktop:mac
npm run desktop:win
npm run desktop:linux
```

Use the target operating system for a supported package build. The included GitHub workflow builds all three platforms and both Mac architectures on free public-repository runners. Local low disk space can prevent packaging; GitHub builders avoid that local requirement.

## Source and design

- [PANDR-5 spreadsheet](https://docs.google.com/spreadsheets/d/1o7sQkxG_r72CH2Dv7CJDyqhSzbeBVhoKN6BVWNjcGjk/edit)
- [Model rules and implementation choices](docs/model-rules.md)
- [Account service and data formats](docs/accounts.md)
- [Free distribution and installation](docs/distribution.md)

The captured sheet and supplied CSVs are in `source/`. `scripts/extract-source.py` reproduces the source exercise definitions and template. Changes to training logic must preserve source parity tests.

The expanded exercise dataset is intentionally left to the project owner. This repository includes only movements already in the supplied model. Fractional allocations are approximate volume accounting, not exact measures of muscle stimulus.

## Privacy and retention

Training data stays in IndexedDB on the device unless an account service is configured and the person explicitly signs in. Signed-out and account profiles are kept separately. No analytics or third-party fonts are loaded. Local data is not encrypted by the app; use device access controls. Browser storage can be cleared or evicted; keep backups. Desktop and browser installations have separate stores.

Free cloud tiers have finite storage, bandwidth, inactivity policies, and no guarantee of lifetime availability. The export formats and offline app are the long-term escape route. Account and database limits must be monitored before expanding a public service.

No open-source license has been selected by the owner yet; no license grant is implied by public source availability.
