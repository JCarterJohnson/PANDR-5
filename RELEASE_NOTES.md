# 0.5.8 — Quiet saving and deliberate drag handles

- Keep plan autosave feedback in a stable header status line. Remove success notices inserted above the editor and suppress the floating saving popup on Your plan, preventing layout shifts and interference with rapid editing. Save and retry behavior is preserved.
- Settings displays the installed build version directly from package metadata; it does not substitute the latest server version for a cached or installed build.
- Require a 450 ms hold on the three-line reorder handle before activation. Early release or movement cancels the pending gesture; mouse, touch, edge scrolling, Escape/cancellation, and keyboard Up/Down controls remain available. Clear pending hold timers when the editor unmounts.
- Preserve account data, assessment progress, allocation, equipment and progression behavior.

The desktop download now includes the current assessment schema and all changes since 0.5.2. Replace the existing application, retaining its application support data. Website updates do not update an older downloaded desktop bundle. Version 0.5.0 can reject `paused` and `onboardingStartedAt` after a successful Google sign-in; updating the application fixes that compatibility error without resetting the account.

# 0.5.7 — Automatic plan saves and grouped assessments

- Valid applied plan changes save automatically after editing pauses. Applying an exercise no longer requires remembering a separate Save plan action. Leaving Your plan first waits for the account save, including while an assessment is open; manual Save plan saves immediately.
- Keep invalid or failed edits in the editor with visible save status, plan checks, and retry. Constrained framework deviations can switch to custom mode and save the same edits directly from the checks. Preview mode still requires sign-in for account persistence. Preserve active-workout locks and constrained validation.
- Group assessment movements by primary muscle, ordered by each group's first appearance across the full program. Preserve program order within each group, de-duplicate repeated movements, and keep later upper-body work beside earlier work. Quads, hamstrings, glutes, adductors, and calves share the Legs group. Show group labels on exercise cards.
- Keep completed baselines and saved partial assessment inputs through plan edits, regrouping, save/reload, and separate assessment visits. No account reset, history deletion, or data migration.
- Stop displaying the saving overlay after a failed account write, so retry controls remain usable.

# 0.5.6 — Exercise editing and live assessments

- Replace up/down exercise-order arrows with one three-line drag handle. Support mouse and touch dragging, edge scrolling, cancellation and Up/Down keyboard moves.
- Add exercise opens a searchable picker immediately. No slot is inserted until an exercise is chosen and its prescription applied; cancelling leaves the draft untouched.
- Exercise search shows all matching name/alias suggestions as a dropdown, with equipment labels and keyboard selection. The same picker supports replacements.
- Saving exercise changes updates unfinished assessment visits in program order. Retain completed observations and unchanged partial inputs, remove deselected movements from the pending queue, and add newly selected exercises needing a baseline. Repair stale persisted queues when opening an account or resuming a visit.
- Preserve account history, completed observations, equipment settings, workout locks and existing assessment/progression rules.

# 0.5.5 — Equipment-specific dumbbell defaults

- Separate freeweight barbell, dumbbell rack and machine/cable defaults. New dumbbell prescriptions use per-dumbbell loads in 2.5 lb steps from 5 through 50 lb, then 5 lb steps through 200 lb.
- Add a dumbbell rack preset and keep its exact load list editable for different rack inventories or cutoffs. Machines and cables retain a configurable 5 lb default, without inheriting barbell plate assumptions.
- Preserve existing account equipment, history, and all progression percentage and rep/RIR rules.

# 0.5.4 — Scale days and use standard equipment

- Scale one or more training days together from the day’s exercise panel. A reference-muscle weekly-set input computes the percentage, while a slider previews proportional exercise sets and all affected weekly muscle credits.
- Apportion whole sets to each day’s rounded total, retain exercises and loads, and reconcile existing selected muscle targets against the complete week. Applying a preview changes the draft; Save plan commits it.
- New plans, added exercises, and exercise replacements use standard equipment defaults. Barbell defaults assume a 45 lb bar and paired 5/10/25/45 lb plates (10 lb total steps). Other equipment starts at 5 lb steps, expressed in the account’s unit.
- Equipment presets let users explicitly choose 2.5 lb or 1 lb plates, or retain their exact lists and increments. Existing account equipment settings and all history remain unchanged until edited.
- Keep all rep/RIR gates and 2–5% increase / 2–3% reduction limits. Equipment holds show the nearest physical step and its percentage; repeated successes do not authorize an out-of-range jump.

# 0.5.3 — Balanced weekly set allocation

- Fit whole sets to selected weekly targets, then balance each muscle across its training days and spread work across exercises.
- Add an automatic set limit per exercise (starts at 6, editable from 1–30). Unattainable targets show their actual planned / target totals rather than silently creating very large prescriptions.
- Preserve lower custom-mode targets when selecting muscles. Keep unrelated exercises, exercise choices, loads, and order; regenerate RIR only when a set count changes.
- Existing saved plans, workouts, assessments, and archived cycles stay intact. No account migration or reset. Apply the new allocator explicitly in Your plan, review, then save.

The automatic limit is an app allocation preference, not a clinical safety threshold. Custom mode continues to allow weekly targets below the constrained framework’s 10-set minimum.

# 0.5.2 — One assessment prompt

- Saved assessments show only Resume assessment; the duplicate Begin prompt stays hidden, including after reloading.
- Includes the save-and-exit and per-workout assessment changes below.

# 0.5.1 — Assess at your own pace

- Save and exit assessments with a visible X control; unfinished entries and completed tests remain saved when you return.
- Unlock each workout as soon as all of that day’s exercises have current baselines. Other days no longer block it, and there is no automatic overnight delay.
- Keep untested exercises mandatory in both modes, including after the first workout. Existing whole-program assessment drafts remain usable.
- Preserve the exact baseline-to-first-workout calculation and subsequent PANDR-5 progression.

Update the web app and install desktop version 0.5.1 on every device before using paused assessment data. Older versions do not understand these new saved fields.

# 0.5.0 — Exercise-specific strength assessment

- Required, resumable first assessment before a new account starts training, in both modes.
- True 1RM or standardized 2–15-rep failure test; same equipment/setup, measured bodyweight/assistance, exercise-specific baseline conversion.
- Exact baseline initializes each movement's first rep/RIR prescription in program order. Existing anchor progression owns all later loads.
- New movements and 14-day gaps prompt reassessment; later bypass is available only in custom mode.
- Constrained load locking with explicit custom-mode override, including mid-workout unlocking.
- Historical observations, in-progress assessments and prescription provenance saved to the account and retained in backup/CSV exports.
- Population-curve uncertainty, unsupported target ranges and unavailable equipment are made explicit.

The prior published app does not understand the new strength metadata. Use version 0.5.0 or newer on devices accessing an account with assessments. On the public web app, reload and choose Update app when prompted. Desktop users should install the updated download.

# PANDR-5 0.4.0 preview

Coaching refinements within the existing PANDR-5 constraints:

- Confirm performance declines across five comparable exposures, including gradual deterioration, instead of reacting to a single lower rep count.
- Record actual equipment load options. Impossible steps show the exact adjustment needed; the app keeps the 2–5% increase and 2–3% reduction limits.
- Set up measured bodyweight resistance and confirmed added/assistance loads. Recommendations can then move between assisted, unassisted and added-weight modes, with the setup preserved in workout history.
- Automatically reduce normal set volume modestly after repeated qualifying recovery check-ins, within the 10–20 effective-set bounds. Recovering, consistently attending users can gradually return toward their saved plan. Changes begin next week; qualifying half-volume pivots still apply.
- View recovery decisions in History and export equipment, resistance and recovery fields in CSV or complete JSON backups.

Equipment setup is in Your plan → an exercise → Equipment and bodyweight progression. Recovery automation is on by default in constrained mode and can be switched off in Settings. The original split, exercise catalog, fractional credits, rep/RIR rules, and custom exercise imports are preserved.

These refinements cannot supply missing equipment, measure your bodyweight setup for you, or resolve persistent sleep problems and pain. New thresholds are transparent app policies informed by research, not validated physiological cutoffs. Read the [research rationale](https://github.com/JCarterJohnson/PANDR-5/blob/main/docs/coaching-refinements.md) and [completed comparison report](https://github.com/JCarterJohnson/PANDR-5/blob/main/research/coaching-refinements/report/REPORT.md).

Update the app on every device before using the new saved fields across them. Older backups remain readable in 0.4.0; older app versions may reject new records until updated. The current web app is at https://pandr-5.vercel.app/.

Verification: 155 automated checks, 13 desktop/mobile browser flows, catalog validation and production web/PWA build. The audit compared 480 paired synthetic people-years. All 120 isolated backend accounts passed, with 27,081 workouts and every weekly/exercise snapshot matching the local engine. Synthetic evidence and reproduction source are included in the coaching-audit ZIP below. The ZIP is research data, not an app installer.

In the controlled ±1-rep noise test, false performance flags fell from 100% to 0.99% of eligible weeks; at ±2 reps, 19.74% still flagged. Poor-sleep median pivot weeks improved from 27 to 25 in the first sample and 26 to 23.5 in the held-out sample. These are simulator results, not human outcome estimates; persistent sleep trouble remains only partly addressed.

Desktop packages are unsigned. All seven download files built successfully; the Apple Silicon Mac download was opened and checked. Windows, Linux and Intel Mac runtime behavior was not exercised here. Mobile uses the installable web app. Update every device before using the new coaching fields across them.
