# Strength assessment and initialization

The assessment is the authoritative starting point for an exact exercise. It initializes the first workout's load from the assessed maximum, the prescribed rep floor and the RIR staircase. After that, existing PANDR-5 anchor progression controls the next load. There is no rolling estimated-1RM filter, hidden safety multiplier, or competing strength progression model.

## Assessment flow

- A new account without completed training history must assess each exercise before its first workout in both constrained and custom mode. The gate checks only the selected workout, preserving its exercise order. Duplicate slots share a movement baseline but retain their own rep prescriptions and subsequent progression.
- The initial assessment is resumable across visits. An entire program can require too many maximal efforts for a reliable single visit; users are instructed to stop when fatigue affects performance. Save and exit preserves unfinished entries and returns to the main training screen. A workout can begin the same day once all of its exercises are assessed; other days remain gated. The configured cycle start date still applies.
- Opening any workout checks its exercises for a missing baseline, a switch between external and measured bodyweight resistance, or at least 14 local calendar days since a completed set or assessment. Empty/unlogged sessions do not reset the timer. History across all cycles counts.
- Custom mode may explicitly bypass a later assessment for that workout. The bypass is saved with the workout. Constrained mode cannot bypass it. A manual reassessment is also available, including after a setup change.
- Existing accounts with genuine completed workout history are not relabeled as new accounts. Their exercises still require a measured baseline before constrained training if they lack one.
- An unfinished workout at least 14 days old cannot accept new sets. Its existing sets can be saved without loss, or the user can discard it, before starting reassessment.
- Assessment occupies the normal workout screen and uses its navigation/layout. A paused assessment can coexist with a workout; assessment recording cannot occur while that workout is active. Assessment observations are separate from sessions, volume, check-ins and recovery evidence.

## Live plan changes

Exercise edits can be saved during an unfinished assessment when no workout is active. The live queue follows the saved plan's movement selections and program order, de-duplicates repeated movements, replaces pending entries after a swap, and drops deselected movements from the queue. New selections needing a baseline join the visit. Existing visits retain their day scope; represented assessment days also supply replacements when an older saved slot ID has been removed. Opening an account and resuming a visit reconcile stale persisted queues as well.

Completed observations remain in history even after a movement leaves the plan. Unchanged movement drafts retain measured loads, reps, setup notes and inline equipment input. Plan prescription edits refresh the draft snapshot; a changed resistance setup clears an unfinished confirmation. A replacement exercise never inherits another movement's result. Assessment form state follows queue changes and refuses stale saves into a different movement. Completing onboarding, initial gating, the 14-day rule and later custom-mode bypasses retain their existing behavior.

## Standardization

Warm up progressively without fatiguing the test muscles. Rest 3–5 minutes between warm-ups/attempts, extending this when needed. Record the exact machine/station, settings, grip, range of motion, tempo, and whether dumbbell weights mean each dumbbell or the pair. Keep that convention unchanged in subsequent workouts. Use safeties or a competent spotter where appropriate.

Choose one successful true 1RM or one known-load set to momentary muscular failure. The default is the failure set: aim for 3–10 clean reps; 2–15 are accepted as an explicit application quality limit. A true 1RM must have exactly one successful repetition. A painful, assisted, shortened-ROM, nonmaximal or technically invalid effort is not a valid assessment. No forced reps or beyond-failure techniques count. The app requires confirmation and rejects invalid counts/loads. It records the lifter's observations; it does not claim camera-based technique or effort verification.

Bodyweight and assisted exercises require measured effective bodyweight resistance. Total resistance is bodyweight plus added load, or bodyweight minus measured assistance. No arbitrary body-mass percentage or band-label conversion is inferred. Machine readings are only comparable on the same equipment/setup.

## Deterministic initialization

Let `f(r)` be relative load at a fresh-set failure capacity of `r` repetitions.

- True 1RM: `maximum = tested resistance` exactly.
- Failure test: `maximum = tested resistance / f(completed reps)`.
- Initial target: `r = repMin + max(non-finisher target RIR)`.
- Initial working resistance: `maximum * f(r)`.
- `0–1 RIR` maps to 0.5 for initialization; `<0` finishers never increase predicted capacity.
- The same resistance is used for every set. The rep floor is used to provide room for double progression; there is no additional percentage reduction.
- Only confirmed equipment rounding changes the resulting load: choose the largest available positive resistance no greater than the calculated value. An unavailable load blocks constrained prescription with an equipment message; zero-load guesses and invented microplates are not used.
- Exactly 185 lb entered as a true 1RM stays 185 lb in this calculation. Historical observations retain original units; internal unit normalization does not round the maximum. Equipment conversion follows existing account-unit behavior.

General, flat bench press and leg press curves use the mean repetition values in Nuzzo et al., Figures 2–4 (95% through 45% 1RM). Piecewise linear interpolation and the exact one-repetition/100% endpoint are application choices, not the authors' published spline equation. Predictions are limited to 1–30 failure-equivalent repetitions, including RIR. The generalized model is not extended to an unlimited endurance range. Bench-specific classification is not applied to incline, decline or dumbbell presses.

A single observation does not identify an individual's entire strength-endurance curve. It anchors an exercise-specific population curve. Predictions farther from the measured rep count and leg-press predictions near maximum have greater uncertainty. No invented individual confidence percentage is shown. The model is not a guarantee of achieved repetitions.

## Handoff to PANDR-5

The first session preserves program order and stores the prescribed load, mode and source assessment ID. Completed sessions retain actual loads and recommendations. Subsequent unchanged rep prescriptions use the prior PANDR-5 recommendation exactly: 2–5% increases, 2–3% decreases, equipment checks, target-RIR gates, pre-finisher anchors, and pivot holds remain authoritative. Rep-range edits translate the last prescribed progression load to the new rep demand; set-count or RIR-only edits keep the established load and let subsequent anchor performance guide changes; they do not erase progress by returning to the original assessment. A new assessment resets initialization for that movement.

Initial per-set rep suggestions use baseline capacity minus target RIR, bounded by the rep cap. Completed preceding sets can reduce the guide as fatigue appears. Once normal training has begun, the existing recommendation's target reps provide guidance. No fixed fatigue percentage is invented. Actual prescribed RIR takes priority over an approximate rep suggestion.

Constrained mode locks workout and plan load editing; the domain completion boundary also checks recorded prescribed loads. Users can turn constrained mode off during a workout, then override its load. Progression starts from the actual performed load. Original prescriptions remain in history and CSV.

## Persistence and compatibility

Optional version-1 strength data preserves old backups. Version 0.5.1 adds the onboarding-start marker and paused drafts; update all devices before using these saved fields. The marker keeps untested movements mandatory after the first partially onboarded workout. Observations are append-only in normal use and survive exercise removal, cycles, backup restore and export. The existing account metadata store saves assessments and in-progress assessment drafts with compare-and-swap conflict detection; competing edits fail visibly rather than overwrite another device. No database migration, permission change or new public data is required. The metadata table's existing 16 MiB server limit still applies.

CSV contains separate strength-assessment rows (method, curve, setup, original load/unit, reps, estimated maximum in kg), full strength-state snapshots, workout source assessment IDs, original prescribed loads, actual loads and bypass decisions. JSON backups retain complete resumable state. Restoring an older backup merges assessment observations rather than deleting newer history.

## Research and interpretation

Source protocol: *Exercise-Specific Load–Repetition Profiling.pdf*, supplied by the user. Its embedded citation tokens are not resolvable bibliographic references, so primary sources were checked separately.

- Nuzzo JL et al. (2024), [Maximal Number of Repetitions at Percentages of the One Repetition Maximum](https://pmc.ncbi.nlm.nih.gov/articles/PMC10933212/), DOI 10.1007/s40279-023-01937-7. Figures 2–4 supply the means used by the curve. The 1/100 endpoint, interpolation, testing rep limit, rounding policy and initialization RIR policy are explicitly app choices.
- Grgic J et al. (2020), [Test–Retest Reliability of the One-Repetition Maximum Strength Assessment](https://pmc.ncbi.nlm.nih.gov/articles/PMC7367986/), DOI 10.1186/s40798-020-00260-z. Supports standardized maximal-strength testing and identifies protocol variation.

Velocity profiling is not implemented because this app has no validated velocity sensor integration or individual minimum-velocity thresholds. In particular, zero velocity is not treated as an observed 1RM. General RIR arithmetic does not establish a validated individual fatigue model.

## Verification

Domain tests cover exact measured maxima, curve monotonicity and bounds, program order, mandatory onboarding, 14-day boundaries, partial sessions, bodyweight/assistance, unavailable equipment, unit conversion, override enforcement, authoritative progression, backup preservation and exports. Account contract tests cover hydration and competing strength edits. Browser tests cover initial assessment, persisted drafts, reload, first training day, mobile layout, later bypass and switching to custom mode mid-workout. These tests check software behavior, not prospective physiological prediction accuracy. Live production-account saving is not exercised by the isolated fixtures.
