# PANDR-5 model rules

## Source and scope

The app follows the supplied **PANDR-5 v1.1.1 Guide Sheet and Blank Fillout**, read September 15, 2026. The source snapshot is `source/live-sheet.json`; the supplied CSVs are retained beside it. The live sheet takes priority where CSV wording differs. This is an implementation of the owner's program, not a newly researched training method.

[Open the original spreadsheet](https://docs.google.com/spreadsheets/d/1o7sQkxG_r72CH2Dv7CJDyqhSzbeBVhoKN6BVWNjcGjk/edit).

`scripts/extract-source.py` regenerates `src/data/seed.ts` from the source snapshot. It parses every term in columns J and K, preserving all contributing muscles and each multiplier. It rejects unfamiliar formula syntax rather than guessing. Repeated exercises must have identical contribution mappings. There are 26 unique source exercises, 35 weekly exercise slots, and 19 reported muscles. Equipment labels are descriptive UI categories and are not a scientific classification. A broader library awaits owner-supplied data.

## Weekly structure and volume

The seven-day sequence is **Push + NCP, Pull + NCP, Legs, Active Rest, Upper, Lower, Active Rest**. The source pairs chest with biceps and back with triceps. The original exercise ordering, set counts, rep ranges, and RIR targets are retained in `DEFAULT_PLAN`.

Effective weekly sets are the sum of each exercise's prescribed sets multiplied by its source coefficient for each muscle: **1 for a primary mover, 0.5 for a secondary contributor, 0.25 for a minor contributor**. A movement may have several muscles with the same coefficient. These are the owner's approximate set credits; they are not precise biological measurements. Fractional contributions count toward training-day exposure, as they do toward effective volume. One day counts once for frequency even if it contains several contributing lifts.

Strict mode requires each selected target to lie in **10–20 effective sets per week**, actual volume in the same range, and exposure on at least two training days. Default selected targets are chest, lats, biceps, triceps, quads, hamstrings, glute max, gastrocnemius, and lateral delts. Other muscles are reported; they are not each independently forced to 10 sets. Targets start at the source total clamped to 10–20. The source's lateral delts total **9**, so the unchanged source template deliberately fails that strict check. Initial strict activation calls the allocator to add a lateral-delt set. This distinction is tested and the original source remains unchanged.

The allocator searches integer set counts for existing exercise slots, keeping the day/exercise order intact. It prioritizes the 10–20 bounds, then closeness to requested targets, then fewer changes. It tries single-count changes and coupled changes to two slots. This is a bounded best-effort search, not a proof that no mathematical solution exists. If it cannot produce a valid plan, it reports the unmet constraints and refuses to imply success. Whole-set limitations can leave exact targets approximate while remaining within the hard bounds. Set input is capped at 30 per exercise as an application guardrail, not a source recommendation.

Strict plan validation also checks the seven-day sequence, known exercises, valid set/rep/load values, one RIR target per set, descending effort targets, and finisher placement. Replacement exercises must match the source primary-muscle roles of their day and preserve its movement-block order. Blocks are derived from the source coefficients: Push chest → lats/biceps/brachialis → lateral delts; Pull lats → triceps; Legs hamstrings → quads → calves → lateral delts; Upper lats → chest → biceps → triceps; Lower hamstrings/glutes → quads/glutes → calves → lateral delts. All highest-coefficient contributors define an exercise’s primary roles, which covers the source hip extension that has no 1.0 coefficient. This preserves the source chin-ups on Push and rejects triceps work inserted into that chest/biceps day. It does not force the original number of exercises per block. It enforces source finisher support. Custom mode reports methodological deviations as warnings while malformed values remain errors. The app must reject strict activation whenever an error remains. Exercise swaps retain the owner's responsibility to provide appropriate source-backed coefficients.

## Double progression

One working load applies across all sets of an exercise. The progression anchor is the final prescribed set, except that a final **<0 RIR** finisher moves the anchor to the preceding set. The finisher itself never controls a load change.

The anchor must be completed with valid reps and RIR. A **0–1** target accepts either endpoint or a value between them; a numeric target requires that numeric RIR. A missing, incomplete, easier, or harder-than-prescribed anchor holds the load.

- At or above the rep cap at the assigned RIR: increase difficulty **2–5%**, then restart at the rep floor.
- Below the floor at the assigned RIR: reduce difficulty **2–3%**, then restart at the floor.
- Within the range: keep the load and build reps.

The preferred increase/decrease percentages default to 2.5% and are clamped to the model ranges. Rounding chooses an equipment-supported load within the allowed range, as close as possible to the preferred change. If the available increment cannot produce a change within the allowed range, the recommendation holds and explains why; it never silently jumps beyond the range. For assisted exercises, an increase in difficulty reduces assistance, and a decrease in difficulty increases assistance. Bodyweight-only mode does not invent external weight: it suggests changing difficulty or choosing weighted/assisted mode. An unset zero external load also holds until the user enters a working load.

Source RIR prescriptions are preserved exactly. When the user changes a set count, `makeRir` builds a descending sequence capped at 3 RIR and ending at 0–1, optionally followed by a <0 finisher. This editing convenience does not replace the original source prescriptions.

## Recovery and pivot weeks

Any one of poor sleep, feeling run-down, elevated resting heart rate, or lingering soreness selects **passive rest**: easy steps and no planned cardio. With none of those flags, the source calls for **20–30 minutes of very easy conversational aerobic work** (approximately 40–60% max heart rate) plus **5–10 minutes of mobility**. No failure work, HIIT, or make-up lifting on either rest day.

A check-in with **at least two of performance dip, joint pain, and poor sleep** schedules a one-week pivot in the following week. Flags must coexist on the same check-in; separate single-flag entries are not added together. Only the immediately preceding week's checks apply. The implementation does not invent a readiness score, automatic weekly volume ramp, or RP periodization.

Pivot sessions use **ceil(normal sets ÷ 2), with a minimum of one**, preserve the load, and keep the first prescribed RIR targets. Keeping the earlier sets naturally removes many later failure sets without inventing a new RIR schedule. These reduced sets are temporary and do not alter the base weekly plan. All load progression holds during a pivot; the normal progression rules resume in a normal training week. Fresh qualifying check-ins can schedule another pivot.

## Calendar and history

Week numbers start at 1, day indexes at 0. Scheduling compares local calendar dates, not elapsed 24-hour intervals, so daylight-saving transitions do not shift training days. Dates before the selected start remain at week 1/day 1. The selected start date is day 1 of the seven-day sequence, regardless of weekday.

Sessions snapshot names, loads, rep ranges, RIR targets, equipment increments, and all muscle contributions. Later plan/library edits therefore do not rewrite historical set credit or prescriptions. All newly generated logs start incomplete, and the UI must explicitly record completion before an anchor can trigger progression.
