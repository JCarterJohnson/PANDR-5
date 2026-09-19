# Exercise catalog completion report

Built and reviewed September 18, 2026. All work is in `App`.

## Delivered

Added **346 canonical exercises** to the unchanged 26 originals: **372 total**. Added **221 aliases** (166 on new exercises and 55 on originals). Five approved groups bring the vocabulary to 24. There are **26 independently verified source records**.

Both library and plan-editor search recognize names, aliases and equipment. Research notes are visible in the library. Saved custom records take precedence, custom values remain intact, and only selected built-ins are appended to a saved account catalog. The model scale, progression rules, default plan, original IDs and original allocations remain intact.

## Confidence

| Scope | High | Medium | Low |
|---|---:|---:|---:|
| All 372 exercise records | 8 | 305 | 59 |
| 346 added exercise records | 3 | 290 | 53 |
| All 820 muscle-credit allocations | 8 | 675 | 137 |
| 752 added muscle-credit allocations | 3 | 637 | 112 |

Confidence describes evidence for the assigned training role. Exact numerical set equivalence is not measured or validated by these counts. All fine-grained fractions remain conservative model estimates.

## Coverage by muscle group

Counts below are canonical exercises crediting the group, including secondary/tertiary credits. A compound can appear in several rows.

| Existing or approved display name | Exercises |
|---|---:|
| Chest (pec major) | 46 |
| Anterior Delts | 55 |
| Lateral Delts | 25 |
| Rear Delts | 40 |
| Triceps | 72 |
| Biceps (Brachii) | 75 |
| Brachialis | 30 |
| Brachioradial. | 30 |
| Lats / teres major | 50 |
| Mid / Low Traps & Rhomboids | 56 |
| Upper Traps | 15 |
| Quads | 62 |
| Hamstrings | 38 |
| Glute max | 84 |
| Glute med/min | 8 |
| Adductors | 58 |
| Gastroc. | 8 |
| Soleus | 12 |
| Erector Spinae | 5 |
| Abdominals | 18 |
| Obliques | 12 |
| Neck muscles | 10 |
| Wrist flexors | 6 |
| Wrist extensors | 5 |

## Coverage by equipment

Equipment labels on original records remain unchanged; `Machine` and `Other` are legacy labels. Bodyweight rows include suitable weighted/counterweight modes; band assistance may be separate because its resistance profile differs.

| Equipment | Exercises |
|---|---:|
| Ab wheel | 2 |
| Barbell | 44 |
| Bodyweight | 58 |
| Cable | 60 |
| Dumbbell | 62 |
| Kettlebell | 10 |
| Landmine | 8 |
| Machine | 8 |
| Manual resistance | 3 |
| Neck harness | 1 |
| Other | 2 |
| Plate-loaded machine | 19 |
| Resistance band | 36 |
| Roman chair | 2 |
| Selectorized machine | 24 |
| Smith machine | 15 |
| Specialty bar | 15 |
| Stability ball | 1 |
| Wrist roller | 2 |

## Evidence limitations and original allocations

The weakest areas are Olympic/ballistic set equivalence, targeted isometric bouts, neck movement directions beyond extension, exact elbow-flexor partition, technique-dependent upper-back roles and individual machine mechanics. Most uncommon variants use explicitly identified anatomy/family inference. Separate hip flexors, tibialis anterior, rotator cuff, serratus and finger/intrinsic-hand groups remain outside the approved vocabulary. Neck remains a coarse group.

Recommended review values are recorded in [legacy-review.md](legacy-review.md). Candidates include removing automatic hamstring credit from leg press/hack squat/lunges, removing incidental glute-med/min lunge and erector hinge credit, clarifying 45° hip extension, and rebalancing a genuinely flared-elbow cable row. Standing calf soleus credit of 1 is plausible but not established as a universal ratio. None of these changes was silently applied to an original record. No evidence warrants replacing the existing bins with invented decimal precision.

## Validation and tests

| Check | Result |
|---|---|
| Unique IDs; exact/alias collisions; vocabulary; primary roles; allowed bins; bounded new credits; strict import shape | Passed, 372 records |
| Near-name duplicate review | 17 pairs reviewed; no unresolved candidate |
| Source references | 26 verified, 0 unresolved bibliographic records |
| Source/default parity | All 26 original records and 35 plan slots match fixtures; 19 source muscle names unchanged |
| Generator reproducibility | Catalog, sidecar, CSV, coverage and source extraction reproduce byte-for-byte |
| `npm test` | 98 tests passed in 8 files |
| `npm run test:browser` | 2 production-browser flows passed |
| `npm run build` | Passed; production assets and offline PWA precache generated |
| `npm run desktop:pack` | Passed: macOS ARM64 app in `release/mac-arm64/`; unsigned per existing configuration |
| `git diff --check` | Passed |

The regression suite loads the full catalog through the unchanged importer, searches every alias, selects exercises, checks exact FSA arithmetic, saves/loads IndexedDB, snapshots history, exports CSV/JSON, restores backups and syncs new/custom exercise records through the real cloud service with a mocked transport. Custom owner-defined muscles, source strings, finisher flags and fractional values are preserved; malformed/duplicate imports still fail atomically.

Browser environment: production preview at `http://127.0.0.1:4178`, installed Chrome via Playwright, desktop 1440×1000 and mobile 390×844. Browser plugin/skill was unavailable, so the installed Playwright dependency was used. Checked page identity, meaningful rendered content, no framework overlay, no application console errors, desktop research expansion, mobile filtering/no horizontal overflow, selecting/saving/reloading a new plan exercise, custom import badge/value preservation, full catalog download and backup restoration. Screenshots were visually inspected and are in ignored `test-results/` run output.

No live account data was changed. Live cloud transport/authentication and Windows/Linux runtime were not retested. Vite reports an advisory large-chunk warning: the main bundled script is about 1.30 MB uncompressed / 229 KB gzip; it remains under the 4 MB offline-precache limit.

## Exact source, data, test and documentation file manifest

Paths are relative to `App`. Generated build/test artifacts in ignored directories are listed separately below.

- `README.md`
- `docs/accounts.md`
- `docs/model-rules.md`
- `package.json`
- `playwright.config.ts`
- `research/exercise-catalog/README.md`
- `research/exercise-catalog/build-catalog.py`
- `research/exercise-catalog/catalog.csv`
- `research/exercise-catalog/completion-report.md`
- `research/exercise-catalog/coverage.json`
- `research/exercise-catalog/fetch-sources.py`
- `research/exercise-catalog/id-registry.json`
- `research/exercise-catalog/legacy-review.md`
- `research/exercise-catalog/live-formula-check.json`
- `research/exercise-catalog/muscle-vocabulary.md`
- `research/exercise-catalog/near-duplicate-review.json`
- `research/exercise-catalog/research-log.md`
- `research/exercise-catalog/source-verification.json`
- `research/exercise-catalog/sources.csv`
- `research/exercise-catalog/validate-catalog.py`
- `research/exercise-catalog/validation-report.json`
- `research/exercise-catalog/verify-sources.py`
- `scripts/extract-source.py`
- `src/Library.tsx`
- `src/Plan.tsx`
- `src/data/additional-muscles.ts`
- `src/data/catalog.test.ts`
- `src/data/catalog.ts`
- `src/data/catalog/master-catalog.json`
- `src/data/catalog/metadata.json`
- `src/data/catalog/sources.json`
- `src/data/seed.ts`
- `src/domain/engine.test.ts`
- `src/services/cloud.test.ts`
- `tests/browser/catalog.e2e.ts`
- `tests/fixtures/legacy-catalog.json`
- `tests/fixtures/legacy-muscles.json`
- `tests/fixtures/legacy-plan.json`

Generated/ignored artifacts: `dist/` production web/PWA output; `release/mac-arm64/` desktop packaging output; `test-results/` Playwright screenshots and run state; `research/exercise-catalog/generation-summary.log` and `source-verification.log` command transcripts. No full-text papers or irrelevant downloads were added to tracked source.

## Entry points

- [Catalog methodology and compatibility contract](README.md)
- [Human-reviewable catalog](catalog.csv)
- [Separate source table](sources.csv)
- [Approved muscle extension](muscle-vocabulary.md)
- [Exact proposed coefficient revisions](legacy-review.md)
- [Research and inference record](research-log.md)
- [Machine-readable validation](validation-report.json)
- [Citation verification](source-verification.json)
