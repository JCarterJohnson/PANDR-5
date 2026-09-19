# PANDR-5 exercise catalog, version 1.0.0

Reviewed September 18, 2026. This is a maintained reference, not a definitive enumeration of resistance exercise or a validated biological dose calculator. Review it at each catalog release and when meaningful longitudinal or systematic-review evidence becomes available. No automatic future research job is implied.

## Deliverables and reproducibility

- `../../src/data/catalog/master-catalog.json`: all 372 canonical records, including the unchanged 26 original records, in the exact existing `{schemaVersion:1, exercises:[...]}` import format. It is a master export, not a file to import over a library already containing those IDs.
- `../../src/data/catalog/metadata.json`: ID-keyed aliases, categories, laterality/loading, setup, primary/secondary/tertiary groups, individual credited-muscle confidence, rationale, evidence scope, limitations and source identifiers. Keeping this separate preserves strict version-1 imports and backups.
- `../../src/data/catalog/sources.json` and `sources.csv`: one source table with 26 real records, bibliographic identities, claim scope and limitations. `catalog.csv` joins exercise IDs to those source IDs for human review.
- `coverage.json`, `validation-report.json`, `source-verification.json`: machine-readable counts and audit results.
- `near-duplicate-review.json`: all 17 candidate pairs at name similarity >=0.88 and the reviewed reason each is distinct.
- `live-formula-check.json`: bounded read-only live Sheet formula verification; the original source snapshot remains in `../../source/`.
- `legacy-review.md`: proposed corrections, not applied to saved or source records.
- `muscle-vocabulary.md`: approved extension and affected app surfaces.
- `research-log.md`: questions, evidence selection and gaps.

From `App`, run:

```sh
npm run catalog:generate
npm run catalog:validate
npm test
npm run test:browser
npm run build
# Optional online bibliographic refresh / identity check:
npm run catalog:sources
python3 research/exercise-catalog/verify-sources.py
```

The generator is offline and deterministic. It enumerates explicitly chosen variants rather than producing a Cartesian product of equipment, grips and positions. The checked-in metadata/CSV are generated outputs; edit the compiler's explicit rows and family rationale, then regenerate and review the diff. Source refresh retains concise bibliography/claims, not papers. Stable IDs are frozen in `id-registry.json`: do not delete or change released IDs. Correct names by retaining the ID and old name as an alias; add a separately versioned ID for an allocation revision rather than overwriting a saved record.

## Model semantics preserved

`contributionSchema` accepts exactly **1, 0.5, 0.25**. Zero credit is represented by absence, never by a zero-valued contribution. Each group occurs at most once in a record. Credits are independent and need not sum to one. The source permits multiple full-credit muscles (for example Lunges); it also has an exceptional 45° Hip Extension with no 1.0 credit.

`calculateVolume` multiplies prescribed working sets by each coefficient, classifies 1 as direct and smaller values as fractional, and rounds aggregate totals to six decimal places (`Math.round(n*1e6)/1e6`). It does not round each coefficient, normalize the sum, or adjust credit for loading mode. An exposure counts any positive credit. Strict split roles use **all maximum-credit groups**, which may differ from the single designated catalog `primaryMuscle`. Both are retained in metadata as `primaryMuscles` and `primaryMuscle` respectively.

The schema limit is 100 contributions per imported exercise; the new catalog imposes a tighter editorial limit of four credited groups and summed credit <=2.5. The original Lunges record is a documented grandfathered exception. These editorial limits are not imposed on custom imports. Existing file/record limits, duplicate behavior, unknown owner-defined muscle acceptance and strict extra-field rejection are unchanged.

For unilateral and alternating movements, a prescribed set means one set for each side, counted once for the bilateral group. The engine has no side-specific volume dimension. Added weight/counterweight assistance is represented with the existing plan load mode, not a second exercise ID when mechanics are otherwise unchanged. Band assistance can have a distinct ID because assistance varies materially across ROM.

The default plan, source exercise objects, source totals, progression, allocator behavior, RIR rules, pivot weeks, account isolation and cloud conflict policy are unchanged. As before, initial strict activation may add the source plan's missing lateral-delt set. New exercises default to `beyondFailureAllowed:false`; anatomy or hypertrophy evidence alone does not authorize a source-style finisher.

## Allocation and confidence standard

Credit dynamic prime movers through meaningful ROM; count substantial synergists conservatively. Do not count grip, balance, passive tension, antagonists or ordinary trunk/neck bracing automatically. Targeted isometrics such as planks are included because resisting the external moment is the explicit exercise task, with **low** confidence in mapping a working bout to one dynamic-set equivalent. Time/steps are never automatically converted to sets. Olympic and ballistic movements also carry low-confidence estimates, and their speed/skill sets should not be treated as demonstrated hypertrophy-equivalent sets.

Confidence applies to the assigned training role, **not a precision guarantee for 0.25, 0.5 or 1**:

- High: an unambiguous direct target with strong anatomical rationale and/or relevant longitudinal evidence; no claim that all implementations or populations respond identically.
- Medium: coherent anatomy and movement-family evidence, with extrapolation to this variation or supporting-muscle fraction.
- Low: important technique sensitivity, sparse direct evidence, coarse anatomical grouping, ballistic/isometric equivalence, or questionable retained source credit.

Fractional values are editorial estimates mapped onto the model's existing bins. No retrieved paper establishes a universal exercise-by-muscle coefficient matrix. EMG is used only for feasibility/classification context and methodological caution, never converted into growth percentages. Family references explicitly identify cross-equipment extrapolation. Primary targeting does not mean every anatomical component of a grouped label grows equally.

## Deduplication rules

1. Normalize case, punctuation and spacing for canonical/alias collisions. Canonical ID uniqueness and normalized names/aliases are mandatory across records.
2. Synonyms, spelling variants (fly/flye, pushup/press-up), regional terms and common abbreviations belong in aliases.
3. Load amount, rep range, tempo and bilateral alternating sequencing alone do not produce extra rows. Conventional added load/counterweight assistance shares the bodyweight ID unless resistance profile changes (band assistance).
4. Split variants only for meaningful changes in joint path, ROM, resistance profile, support/stability, forearm orientation, loading position or working limb. Same numerical credit does not mean the mechanics are identical.
5. Rope/straight-bar attachment preference does not split the original cable pushdown or pullover. Original RDL already explicitly includes barbell and dumbbell: both are aliases of `source-21`.
6. Distinguish machine mechanics, not manufacturers or paint colors: linked horizontal handles, independent converging levers, sled paths, pendulum arcs, hip belts and restrained spinal-extension pivots. Setup notes constrain the generic label; brand alone cannot establish allocation.
7. Review near-name pairs separately from exact collision checks. Also inspect movement families for conceptual duplicates missed by string matching; legacy broad names take precedence over invented replacements.

## Integration and compatibility

`availableExercises(saved)` overlays missing built-ins onto the account catalog without writing account data. Existing IDs and identical saved name/equipment pairs take precedence. `catalogForPlan` appends only newly selected records when a plan is saved, so old clients and portable backups have the complete six-field exercise definition. No catalog-wide account migration or bulk synchronization is triggered.

Search works by canonical name, alias and equipment in both library and plan editor. Built-in research is attached only when all six saved fields match the canonical record (contribution order is immaterial). Imported custom values cannot acquire a research badge just by borrowing a built-in ID. The same canonical six-field built-in exported/reimported remains recognizable; custom variations receive no confidence or citation assignment.

Catalog imports still validate against **saved records**, not the unselected overlay. Thus adding built-ins does not newly reject a previously accepted custom file. If a custom file occupies an unselected built-in ID/name, its supplied values take precedence. Existing saved IDs/names still cause whole-file rejection as before.

The complete backup exports saved data including every selected built-in; it does not add unused library records to account data. The library's catalog export includes the complete available library. Research sidecars ship with the app and remain reviewable here; they are not silently injected into user imports or old schema backups.

## Remaining limits

The set is comprehensive practical coverage, not “every exercise.” Particular machine models, grip attachment minutiae, rehabilitation protocols, unstable novelty variations and sport-specific drills are intentionally not enumerated. Hip flexors, tibialis anterior, rotator cuff, serratus anterior, intrinsic hand/finger and separate neck compartments remain unrepresented; do not map them falsely into an adjacent group. The approved five additions address the requested gaps but do not eliminate anatomical granularity limits.

No live user account was modified for testing. Cloud sync is verified through the real service logic with its mocked transport and account-isolation harness; a new live cloud round trip and Windows/Linux runtime checks were not performed in this catalog change.
