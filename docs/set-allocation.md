# Set allocation: audit, evidence, and application policy

Research search cutoff: **October 10, 2026**. The search prioritized peer-reviewed papers, journal pages, PubMed, and full text in PubMed Central. It was a best-effort targeted review, not a registered systematic review or a guarantee that every relevant paper was located. Publication dates below distinguish online publication from later issue dates where useful.

## What prompted the audit

The supplied screenshots showed these prescribed working-set distributions:

| Day and primary group | Exercises in displayed order | Sets shown |
| --- | --- | --- |
| Push + NCP, chest | Bench Press; Incline Dumbbell Press; Machine Chest Flyes | 2 / 2 / 4 |
| Push + NCP, biceps/brachialis | Preacher Curls (Machine); Hammer Curls | 4 / 1 |
| Pull + NCP, back | Single-Arm Bent-Over Dumbbell Row; Lat Pulldown (Standard Bar); Lat Pullovers (Cable; any attachment) | 3 / 2 / 1 |
| Upper, back | Wide-Grip Seated Cable Rows; Lat Pullovers (Cable; any attachment) | 4 / 1 |
| Upper, chest | Incline Dumbbell Press; Machine Chest Flyes; Incline/Elevated Pushups | 1 / 5 / 1 |

The counts alone cannot establish that a program is ineffective. A single set can produce adaptation, and an intentionally prioritized exercise can reasonably receive more sets. The problem is an unexplained distribution produced by a numerical objective without an explicit programming purpose.

The previous allocator optimized integer counts in this order: constrained weekly-volume bounds, exact requested-target fit, balance of all credited muscle volume across days, the sum of squared exercise set counts, then changes from the original plan. Exact target fit took precedence over spreading sets. It also treated indirect-only days as equal candidates for day balance. This could make a numerically exact fractional-credit fit outweigh the benefit of giving a retained exercise a normal multiple-set prescription. Its output was deterministic, but determinism is not evidence that a particular split is physiologically optimal.

The source template, automatic weekly allocation, proportional day scaling, and temporary recovery/pivot reductions are distinct mechanisms. A one-set result from a temporary pivot is not necessarily an allocation error. This revision concerns the automatic weekly allocator and the ability to inspect and express its priorities.

## What the research establishes

### Volume is useful, but additional sets have diminishing returns

Pelland et al. synthesized 67 studies involving 2,058 participants. Higher weekly set volume was associated with greater strength and hypertrophy, with more pronounced diminishing returns for strength. Distinguishing direct and indirect sets improved prediction. The best-supported tested counting method counted direct sets as one and indirect sets as one-half. Frequency had a clearer association with strength than with hypertrophy after the model adjustments. These are pooled dose-response findings, not a formula deciding the optimal count for each exercise. [Pelland et al., Sports Medicine, February 2026; online December 4, 2025; DOI: 10.1007/s40279-025-02344-w](https://pubmed.ncbi.nlm.nih.gov/41343037/)

The 2026 ACSM position stand synthesized 137 reviews involving more than 30,000 participants. It supports multiple sets and higher weekly volume for hypertrophy, and heavier loading, priority placement, and repeated practice for strength. Its discussion advises at least two sets per exercise while explicitly stating that the exact count needed to optimize adaptations cannot be determined. Its systematic review search ended in October 2024, with later contextual references. A two-set default is reasonable; one set is not worthless, and two sets do not guarantee an optimal prescription. [Currier et al., Medicine & Science in Sports & Exercise, April 2026; online March 5, 2026; DOI: 10.1249/MSS.0000000000003897](https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/)

A July 2026 trial in 27 strength-trained male athletes found no additional muscle-size benefit when an already high-volume program increased weekly sets by 50% for seven weeks. The deadlift comparison favored the lower-volume condition. Its approximately 40-versus-60-set contrast does not establish a universal ceiling, but it argues against assuming that more sets will always repair a programming problem. [Räntilä and Ahtiainen, Journal of Science in Sport and Exercise, July 13, 2026; DOI: 10.1007/s42978-026-00387-7](https://link.springer.com/article/10.1007/s42978-026-00387-7)

### Exercise coverage matters; compound and isolation labels are insufficient

A 2026 within-participant trial in 17 untrained adults compared knee extension with leg press for 12 weeks. Overall quadriceps/vasti growth was similar, but knee extension produced substantially more rectus femoris growth, while leg press produced additional glute and adductor growth. That supports complementary exercise selection, not a universal compound-to-isolation allocation ratio. [Kinoshita et al., Medicine & Science in Sports & Exercise, July 2026; online February 3, 2026; DOI: 10.1249/MSS.0000000000003957](https://pmc.ncbi.nlm.nih.gov/articles/PMC13215645/)

A 2025 eight-week trial in 30 trained participants likewise found differing regional responses to leg extension versus leg press, and differing calf responses to straight-leg versus seated work. Small, short trials cannot determine the ideal distribution across all movements, but they show why exercises with the same broad primary-muscle label need not provide identical coverage. [Burke et al., Journal of Science in Sport and Exercise, 2025; online March 3, 2025; DOI: 10.1007/s42978-024-00299-4](https://journal.hep.com.cn/josisae/EN/10.1007/s42978-024-00299-4)

A seven-study meta-analysis found broadly similar whole-muscle hypertrophy with single-joint and multijoint training. Combining them may help target muscular subdivisions, but that possibility remains understudied. It does not justify automatically awarding compound exercises a greater share or treating isolation sets as inferior. [Rosa et al., Strength & Conditioning Journal, February 2023; DOI: 10.1519/SSC.0000000000000720](https://doi.org/10.1519/SSC.0000000000000720)

Systematic exercise variation can help regional development and strength, whereas excessive/random variation or redundant selections may compromise adaptations. The underlying review included eight studies and 241 young men, so its conclusions are useful principles rather than an exact exercise-count rule. [Kassiano et al., Journal of Strength & Conditioning Research, June 2022; DOI: 10.1519/JSC.0000000000004258](https://doi.org/10.1519/JSC.0000000000004258)

A 2025 Bayesian meta-analysis of 12 studies found small/trivial regional differences between longer and shorter mean-muscle-length conditions, with substantial practical equivalence. The contrasts averaged only a 21.8% difference in mean muscle length, limiting generalization. The allocator therefore should not invent a universal muscle-length multiplier or an estimated growth score. [Varovic et al., International Journal of Sports Medicine, December 2025; online June 26, 2025; DOI: 10.1055/a-2615-4935](https://pubmed.ncbi.nlm.nih.gov/40570881/)

### Priority and effort depend on the objective

An exercise-order meta-analysis of 11 studies found larger strength gains in exercises performed earlier, without a detectable overall hypertrophy advantage for compound-first versus isolation-first order. Strength specificity supports an explicit priority exercise and appropriate session placement. Visual order alone should not silently become its allocation priority. [Nunes et al., European Journal of Sport Science, February 2021; online February 2020; DOI: 10.1080/17461391.2020.1733672](https://pubmed.ncbi.nlm.nih.gov/32077380/)

Exploratory meta-regressions associated closer proximity to failure with greater hypertrophy, whereas strength gains were relatively insensitive across RIR. The RIR values were estimated from intervention descriptions, with modest model fit. This does not validate converting each prescribed set into a precise RIR-dependent effective-set coefficient. Effort matters, but its exact interaction with exercise allocation remains uncertain. [Robinson et al., Sports Medicine, September 2024; online July 6, 2024; DOI: 10.1007/s40279-024-02069-2](https://pubmed.ncbi.nlm.nih.gov/38970765/)

### There is no established hard per-session cutoff

The frequently cited approximately 11 fractional sets per session comes from a discoverable SportRxiv **preprint**, not a verified peer-reviewed journal publication in this search. Its authors describe a detectability/uncertainty threshold, not a physiological maximum, and note sparse evidence at very high session volumes. The July 2026 paper cited above still references it as SportRxiv. It is not a basis for a hard ten- or eleven-set cap, a claim that later sets cannot work, or a guaranteed optimum. [Remmert et al., SportRxiv preprint, 2025; DOI: 10.51224/SRXIV.537](https://sportrxiv.org/index.php/server/preprint/view/537)

## Source accounting versus research interpretation

PANDR preserves the owner's source coefficients: **1.0, 0.5, and 0.25**. Weekly credits remain:

`V[muscle] = sum(exercise sets × source coefficient for that muscle)`

The original coefficients are approximate bookkeeping, not measured biological stimulus. Pelland's comparison tested direct sets at one and indirect sets at zero, one-half, or one. It **does not validate the source's quarter-set category**, nor every individual exercise mapping. Preserving these coefficients maintains compatibility with the owner's method; it should not be described as validation of all source credits by that meta-analysis.

A future supplementary audit could show direct and indirect exposure separately and a `direct + 0.5 × indirect` summary alongside the source total. That recommendation does not replace legacy coefficients in this revision, and the half-set convention should remain labeled an approximation. Catalog metadata, custom/imported coefficients, and source mappings can have different confidence levels.

The catalog already documents exercise-specific uncertainties in [the legacy coefficient review](../research/exercise-catalog/legacy-review.md), including full lats credit for the source wide-grip/flared-elbow row and hamstring half-credits for leg press, hack squat, and lunges. Technique and anatomical role can make those credits questionable. This allocator revision preserves the original definitions for model/account compatibility; it does not resolve those biological mapping questions. Categories in the review describe movement types, not validation of their credit values.

The source's constrained **10–20 effective-set range** is a program rule. It is not a universal biological optimum established for every muscle, individual, or exercise selection. Nor is the application’s per-exercise allocation limit a medical safety threshold.

## Allocation policy in this revision

The policy below is an **application design inference informed by the evidence**, not an experimentally validated optimizer. It makes the tradeoffs visible and avoids false precision. Retained exercises receive integer counts of at least one set. No exercises are inserted, removed, or reordered by allocation.

The objective is evaluated lexicographically, in this order:

1. **Respect constrained weekly-volume bounds and the chosen per-exercise allocation limit.** A softer preference cannot override these constraints. In custom mode, the source's constrained range does not apply.
2. **Avoid target misses outside a one-effective-set tolerance for muscles with fractional supporting credits.** Targets counted entirely in unit/full-set credits use zero tolerance, even when another target in the same component has fractional support. Thus a simple attainable direct-set budget of five is not quietly reduced to four. The fractional-credit tolerance prevents an exact fractional-credit match from dominating the rest of the programming policy. One effective set is an engineering bookkeeping tolerance, not a demonstrated physiological equivalence interval.
3. **Prefer at least two working sets for every retained exercise contributing to the selected targets.** One-set prescriptions remain possible when constraints/capacity/target fit make the normal default infeasible. They are an inspectable compromise, not proof that the exercise cannot work.
4. **Balance primary-role exposure across primary training days.** Primary roles are the exercise's highest source-coefficient contributors, including ties. Indirect contributions still count in weekly totals and target fit, but an indirect-only day is not treated as an equivalent direct-training day for this balance preference.
5. **Spread remaining work with a dose-normalized convex set-count penalty and optional explicit user priority.** The normal weight is one; a user-designated priority uses weight two. This is an editable preference for a greater share, not a claim that its sets produce twice the growth or a guarantee that the resulting count doubles. There is no blanket compound, isolation, equipment, EMG, or muscle-length bonus.
6. **Reduce remaining requested-target error.** Exact fit still matters after the tolerance, normal multiple-set prescription, role balance, and spread preferences have been considered.
7. **Prefer fewer changes when all higher objectives tie.** Preserve deliberate prior edits where they are equally compatible with the chosen policy.

Primary-role balance uses the available source coefficients. It is **not anatomical coverage optimization**: the current schema does not fully encode regional development, movement families, joint actions, or exercise-specific growth responses. Explicit movement-family/region metadata and prospective validation would be needed to make stronger claims about complementary exercise coverage.

The search remains deterministic. Small independent components can be enumerated exactly; larger components use bounded deterministic searches and are best effort. Neither the search nor its score estimates individual growth, proves a unique optimal program, or diagnoses inadequate recovery. A search miss is not proof that no mathematical solution exists.

## Score formulas and search limits

For each connected exercise/muscle component, candidates use this lexicographic score (earlier terms always take precedence):

`[strict-bound error, target error outside tolerance, number of one-set slots, primary-day imbalance, exercise-share imbalance, residual target error, edits]`

- Weekly source credit is `V_m = sum_i(n_i * c_im)`.
- Strict-bound error is `sum_m(max(0, 10 - V_m)^2 + max(0, V_m - 20)^2)`, or zero in custom mode. Engine validation blocks applying a constrained result with any remaining errors.
- Target error outside tolerance is `sum_m(max(0, abs(V_m - target_m) - tolerance_m)^2)`. `tolerance_m` is one only when that muscle has a positive fractional contribution; otherwise it is zero.
- Primary-day imbalance is `sum_m sum_d(primaryCredit_md / weeklyPrimaryCredit_m - 1 / primaryDays_m)^2`. When the selected muscle has no primary exercise at all, it falls back to the contributing days and source credits.
- Exercise-share imbalance is `sum_days(sum_i(n_i^2 / priority_i) / sum_i(n_i)^2 - 1 / sum_i(priority_i))`, within each connected component/day group. Priority weights are one or two. Dose normalization avoids rewarding smaller counts solely because an unnormalized squared penalty shrank.
- Residual target error is `sum_m(V_m - target_m)^2`; the final edit cost is `sum_i(abs(n_i - previous_i))`.

The share formulas express the policy's preferences, not biological growth estimates. They do not distinguish anatomical regions or assign compound/isolation bonuses. Components with at most 100,000 candidate combinations are exhaustive. Larger components use fixed deterministic seeds, bounded descent, full single-count replacements, and pair replacements. The pair neighborhood is restricted for larger components or unusually high caps; this remains best effort. Stable slot keys make row reordering independent of allocation tie handling.

## User-visible interpretation and safeguards

- Display the requested and actual weekly source credits, total working-set changes for the week and each day, the chosen set limit, priority choices, and remaining mismatches. A near-target result is not silently relabeled exact.
- Explain singleton compromises and concentration, particularly when the budget contains too many retained exercises. Suggesting fewer purposeful selections is a reasonable programming inference; one set can also be retained intentionally.
- Keep manual set edits available. A user can prioritize a lift, retain a one-set accessory, or choose a different split without the UI claiming that the automatic alternative is scientifically optimal.
- Reordering for presentation does not itself confer greater set priority. Strength-priority placement can be an intentional user choice.
- Do not infer hypertrophy response from a single workout, acute EMG, soreness, or strength gain alone. This revision introduces no estimated growth score or automatic volume ramp.
- Preserve historical sessions and assessment snapshots. Allocation changes current prescriptions through the existing explicit editor workflow; opening an existing plan does not silently rebalance it.
- Keep temporary pivot/recovery rules and proportional day scaling distinct from the weekly allocator. Their counts have their own stated purposes and may still include one-set prescriptions.

## Regression evidence

The regression reconstructs the visible screenshots; it does not read or assert the owner's unpictured account target settings. The browser fixture retains the source Lower/Legs selections and targets while replacing the displayed upper-body counts. Selected targets are chest 15, lats 15, biceps 15, triceps 18.5, quads 20, hamstrings 19.5, glute max 11.75, gastrocnemius 10, and lateral delts 10. The automatic limit is six and every exercise has standard priority.

| Day/group | Exercises in displayed order | Before | Verified proposal |
| --- | --- | --- | --- |
| Push chest | Bench; incline press; fly | 2 / 2 / 4 | 3 / 2 / 2 |
| Push elbow flexion | Preacher curl; hammer curl | 4 / 1 | 4 / 4 |
| Pull back | Row; pulldown; pullover | 3 / 2 / 1 | 2 / 2 / 2 |
| Upper back | Row; pullover | 4 / 1 | 2 / 3 |
| Upper chest | Incline press; fly; push-up | 1 / 5 / 1 | 3 / 3 / 2 |

All selected weekly effective targets match exactly in this fixture. Raw working sets change **111 → 114**: Push **20 → 23**, Pull **15 → 14**, Upper **24 → 25**. Source lateral-delt volume rises from nine to ten. Raw exercise sets and source effective credits are different quantities: moving work between exercises with different supporting contributions can change raw counts while keeping the selected effective totals. The review displays both, rather than describing this as an unchanged raw dose.

Tests verify exact targets and no one-set upper-body remnants in the reconstruction, idempotence, row-reorder invariance, priority preference, necessary one-set cases, direct budgets with fractional overlap, source-template initialization, and legacy recovery-signature compatibility. Browser checks verify review/cancel/apply, priority persistence and reset on exercise swap, account reload, active-workout blocking, stale-input blocking, and preservation of history/archived cycles/assessments. Favorable-looking counts are not evidence of superior hypertrophy; they demonstrate that the application follows its stated policy and exposes the dose tradeoffs.
