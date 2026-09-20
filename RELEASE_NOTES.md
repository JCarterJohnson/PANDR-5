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
