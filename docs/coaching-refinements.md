# Coaching refinements: rationale and limits

Policy specified September 20, 2026 before running the revised annual simulation. These are transparent implementation choices, not clinically validated optimal thresholds. Their purpose is to improve decisions while preserving PANDR-5's constraints. Lowering the simulated pivot count or raising simulated gains is not a pass criterion.

## Invariants

The source split, exercise order and muscle roles, fractional set credits, frequency, rep ranges, RIR anchors, one working load per exercise, 2–5% increases, 2–3% decreases, and the two-symptom pivot gate remain. Pivot weeks still halve working sets, rounded up, and hold load. Unresolved symptoms are never suppressed to hit a target number of normal weeks.

## Confirming a performance decline

One lower anchor is an observation, not a trend. A pre-simulation positive-control test also exposed gradual declines that a two-low-anchor rule alone would miss. A second route now recognizes five comparable anchors with no rebound, at least three downward intervals and a total drop of at least three reps, with no interval performed at easier reported effort. This requires deterioration beyond the full range of ±1-rep stationary variation; its exact thresholds remain a conservative policy. Automatic corroboration requires two successive low anchors, each at least two reps below every one of the preceding three comparable anchors, with the same or greater reported effort. Comparisons require unchanged exercise slot, load, unit, resistance setup, set count, rep range and RIR prescription. More than 14 days between exposures or more than 42 days across the five observations invalidates the comparison. At least two distinct exercises must qualify to provide one performance flag. A user's reported decline remains a separate way to supply that same flag; the two are never double-counted.

The minimum drop excludes one-rep noise; using the low end of three baseline observations accounts conservatively for observed variation; requiring confirmation avoids reacting to one bad day. These choices trade slower detection for fewer spurious flags. They can still miss genuine deterioration or flag unusually persistent noise. They are not a statistical significance test or a diagnostic for overtraining.

Primary research [on prediction error near failure](https://pmc.ncbi.nlm.nih.gov/articles/PMC5712461/) supports treating effort/repetition estimates as imperfect. It does not validate this exact two-rep/five-exposure algorithm. Validation must include stationary noisy controls, abrupt and gradual true declines, changed prescriptions, missed weeks and independent seeds.

## Equipment and bodyweight

Explicit available-load lists take precedence over rounded increments. An impossible step becomes a visible equipment requirement with the exact allowed adjustment. It cannot be accumulated into an oversized jump, replaced with extra unrequested sets, or hidden by changing the rep cap. Adding real fractional loading can resolve it; repeatedly recording success cannot make unavailable equipment exist.

Calibrated bodyweight movements use recorded bodyweight resistance plus added load minus assistance. The same percentage limits apply to this total resistance. Only user-confirmed added loads and measured assistance options are selected, including transitions through unassisted bodyweight. This is a mechanical loading proxy for an unchanged setup, not an estimate of muscle force or equivalent training stimulus. Uncalibrated exercises request setup; the app does not invent body-mass percentages, band tension or equivalence between exercise variations.

[Suprak et al.](https://pubmed.ncbi.nlm.nih.gov/20179649/) found that supported body mass varies with push-up position and technique. That supports avoiding a universal coefficient; it does not establish a universal conversion from scale readings to training intensity. Full body mass is appropriate only where the whole body is suspended/moved, such as a consistent pull-up setup. Other movements require a relevant measured resistance or remain manually configured.

## Persistent recovery trouble

In constrained mode, two qualifying check-ins within four weeks initiate a reduction of up to 10% of the normal weekly working-set count, with at least two weeks between reductions. Remove at most one set from an exercise slot per review. Every candidate must still pass all strict plan checks; selected muscles remain within 10–20 effective sets across at least two training days. Exercise choice, load and rep ranges do not change. The user's original plan and desired muscle targets remain the ceiling, and adjustments take effect next week, including when the check-in falls midweek.

After three consecutive non-pivot weeks with clear recovery flags and at least 80% of the scheduled days substantially completed, restore up to 5% of weekly working sets toward the original plan. Restoration also waits at least three weeks after the preceding adjustment. Missing check-ins, missed training, high fatigue ratings or recurring symptoms prevent restoration. Custom mode does not silently impose this constrained-volume controller.

The 10%, 5%, two/four-week and three-week thresholds are conservative engineering policies chosen to bound each intervention and allow observation, not effect sizes supplied by research. Integer sets can make smaller adjustments necessary. At the valid minimum, persistent trouble is reported honestly; further reductions or a different schedule would leave the constrained model and require a separate decision.

[Bell et al.'s Delphi study](https://link.springer.com/article/10.1186/s40798-023-00633-0) supports individualized reductions in training stress, while explicitly identifying limited empirical evidence for optimal deload design. It is expert consensus, not proof of the controller's thresholds. [Coleman et al.'s trial](https://pubmed.ncbi.nlm.nih.gov/38274324/) tested a week of complete cessation in a nine-week program; it cannot validate repeated PANDR-5 half-volume pivots or justify suppressing recovery symptoms. The controller adjusts the underlying dose instead of arbitrarily banning additional pivots.

## Audit requirements

Use unchanged simulator physiology and paired seeds for the old/new comparison. The original audit used a single random stream, which let changes in set counts change later sleep/adherence draws. For fair pairing, the comparison now gives life events, attendance, check-ins and each exercise independent deterministic random streams. Rerun both the frozen original controller and the refinement with this same revised harness; do not compare a new outcome to the old audit as though life events were identical. Report true-decline detection as well as false flags; do not optimize for zero flags. Separate resistance calibration from algorithm changes in the bodyweight comparison. Leave coarse-equipment scenarios genuinely coarse, and report unresolved hardware requirements. Test new seeds, high noise, no adaptation, low-volume plans, missing check-ins, cycle changes, unit conversion, imports, immutable history and real isolated account restoration. No synthetic result demonstrates human efficacy, injury safety or an optimal individualized dose.
