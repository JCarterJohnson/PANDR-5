# PANDR-5

A training app built from the PANDR-5 v1.1.1 spreadsheet. Choose a plan, log your working sets, and get a clear explanation of the next session’s load.

## Current release

**0.3.0 adds a 372-exercise catalog, alias search, and research notes.** Google sign-in and cloud synchronization remain available. The current working version saves training to a Google-linked account. Signed-out use is an unsaved preview; account saves require a connection. Old device histories remain available for export. Use Settings to export your complete history as CSV or a lossless JSON backup.

- **Phone or desktop browser:** [open PANDR-5](https://pandr-5.vercel.app/), then install it from your browser.
- **Desktop downloads:** [get version 0.3.0](https://github.com/JCarterJohnson/PANDR-5/releases/tag/v0.3.0).
- **Earlier local edition:** [GitHub Pages edition](https://jcarterjohnson.github.io/PANDR-5/).
- Windows/macOS packages are unsigned. They do not have paid code-signing or Apple notarization. Download only from this repository; operating systems may display security warnings.
- Hosting uses Vercel Hobby, Supabase Free, and GitHub. No purchased domain or paid upgrade was required. Free service quotas and availability limits apply.

## September 18 app updates

- Named training cycles with archived plans and cycle-filtered history.
- Live local-date weekly check-in scheduling, optional recovery measurements, and comparable-workout evidence.
- Completed effective-set progress, workout navigation drawer, help links, and Light / Dark / Automatic appearance.
- Account-only saving, visible save failures, creator support and contact links.
- [Recovery evidence and dataset review](research/recovery/README.md).

## Features

- Original Push / Pull / Legs / recovery / Upper / Lower / recovery template.
- One working load per exercise, set-level reps and RIR, resumable sessions, and a rest timer.
- Progression from the prescribed anchor: final normal set, or the set before a beyond-failure finisher.
- Model-based 2–5% increases and 2–3% reductions, with equipment increment checks and assisted/bodyweight handling.
- Full and fractional muscle credits from the original sheet’s live formulas.
- Selected 10–20 weekly effective-set targets, integer set allocation, strict split/order checks, and a custom-mode switch.
- Weekly recovery check-ins and a temporary half-set pivot after multiple flags.
- 372-exercise built-in catalog with alias search, research notes and unchanged validated custom imports.
- All-time CSV export plus lossless JSON backup/restore.
- Google account authentication and optimistic, per-user cloud synchronization with conflict detection.

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

The expanded library includes 346 additions and 221 aliases, plus the unchanged 26 source records. It covers the original 19 muscle groups and five approved additions (abdominals, obliques, neck, wrist flexors and wrist extensors). Fractional allocations remain approximate volume accounting. See [the reproducible research record](research/exercise-catalog/README.md) and [proposed source-allocation corrections](research/exercise-catalog/legacy-review.md). Run `npm run catalog:validate`, `npm test`, `npm run test:browser`, and `npm run build` to verify changes.

## Privacy and retention

New training data persists only in the signed-in Supabase account linked to Google. Signed-out preview changes disappear on reload. Account training and merge baselines stay in memory while open; only the authentication session persists on the device. Existing IndexedDB copies from older releases remain untouched and can be exported from Settings. An unsuccessful cloud save is clearly marked and triggers a leave-page warning. No analytics or third-party fonts are loaded.

Free cloud tiers have finite storage, bandwidth, inactivity policies, and no guarantee of lifetime availability. The export formats and offline app are the long-term escape route. Account and database limits must be monitored before expanding a public service.

No open-source license has been selected by the owner yet; no license grant is implied by public source availability.


## Coaching refinements (0.4)

The app now confirms performance trends, stores exact equipment options and measured bodyweight resistance, and adjusts normal recovery volume within the existing strict bounds. The source split, fractional credits, load-change limits and pivot gate are preserved. [Policy and research](docs/coaching-refinements.md) distinguish source rules from new conservative implementation thresholds. [Reproducible comparison](research/coaching-refinements/README.md) covers the unchanged physiology assumptions, paired controls, held-out people and isolated account checks.

In Your plan, open an exercise and expand Equipment and bodyweight progression. Confirm actual load options or record a measured bodyweight setup once; update it when equipment or body mass changes. Automatic recovery volume is on by default in constrained mode and can be turned off in Settings. Train shows adjusted sets, History preserves decisions, and CSV/JSON exports include the full setup. Use the latest web/desktop version on every device before sharing new-format records across them.


Desktop release builds upload directly to a draft GitHub release, without duplicating the installers in Actions artifact storage. Push a version tag or dispatch `desktop.yml` with the matching `release_tag`. After all three platform jobs and the account audit pass, publish the draft. Standard public runners are used; no larger paid runners are configured. Existing downloads remain available.
