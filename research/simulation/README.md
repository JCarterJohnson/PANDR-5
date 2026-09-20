# One year of synthetic PANDR-5 training

This is a software and plausibility stress test, not a clinical trial, a prediction of anyone's gains, or evidence that PANDR-5 outperforms another program. No real people or production accounts are part of it. Generated strength capacity is an input assumption of the simulator, not a measured outcome of the app.

## Design

120 synthetic lifters, 365 calendar days each, fixed seed family `520260000`. Ten participants in each deliberately selected scenario: novice, intermediate, experienced, slow response, recurring poor sleep, missed sessions, a six-week break, coarse equipment, noisy RIR estimates, conservative effort, pain episodes, and a custom three-day schedule. These equal-size cohorts are a coverage design; they are not population prevalence estimates. Half log kilograms and half pounds. Bodyweight and assisted movements are included. A return from the long break creates a new training cycle.

The simulator calls the production `allocateSets`, `validatePlan`, `createSession`, `recommendProgression`, `isPivotWeek`, `checkInDue`, `performanceEvidence`, `completedWeeklyVolume`, cycle, validation, JSON backup and CSV export functions. Session completion mirrors the short `Workout.finish` state transition in `src/Train.tsx`. It does not click through a year's worth of browser screens. Check-ins are allowed only on the actual scheduled weekday, once per cycle week. Old cycle recovery flags and volume must not leak into new cycles.

All 120 accounts use real Supabase Auth, PostgREST and PostgreSQL with the unchanged production training schema and row-level security. Each completed workout and check-in goes through production `syncData`; the test also saves every individual set in the first and last full weeks for 12 representative accounts. It does **not** replay every set-save for every account. Fresh-memory hydration occurs monthly and fresh-auth-client hydration at year end. This tests the account persistence path, including record fingerprints and merge rules, rather than writing finished totals straight into SQL.

The harness redirects only Supabase client construction to the current real test client. It does not mock database responses, authentication, queries, RLS, synchronization, exports or progression. Test account creation uses the local administrator key; workout reads/writes use that account's normal access token and public key. Local password login is used to automate identity creation; Google's OAuth consent screens are not retested here. A hard loopback-host check refuses hosted/production backend URLs.

The twelve ephemeral GitHub runners each have a separate local Supabase installation and ten accounts. This is 120 account-years distributed across twelve real databases, not 120 concurrent users on one production server. It does not benchmark Supabase Free's internet latency, quotas, service availability or peak concurrent capacity. No hosted project, branch, paid runner, production identity or email sender is used. Standard runners for this public repository are free; synthetic evidence is emitted to run logs rather than billable artifact storage. Local backend keys and passwords are never part of the exported evidence.

## Independent response assumptions

Each person has a sampled initial strength scale and movement-specific latent capacity. Reps use the approximate inverse Epley relationship `30 × (capacity / effective load − 1)`, with separate readiness, session noise, and within-session fatigue. This relationship is a convenient generator, particularly uncertain at high repetitions and for bodyweight/assistance. It is not a validated universal biological model.

Capacity evolves from actual completed work, effort and recovery. It approaches a sampled ceiling; increasing the app's prescribed weight does not itself increase capacity. Nominal long-run ceilings are 65% for novices, 34% for intermediates and 16% for experienced participants, each multiplied by a sampled 0.65–1.35 factor. The slow-response cohort multiplies this by 0.15. These are **chosen test parameters, not estimated population effects**. Weekly adaptation coefficients are 0.025–0.05 with movement variation. Missed weeks can reduce modeled capacity. The six-week break uses a simple detraining rule; it does not implement or quantify muscle memory.

Attendance normally ranges from 87–99%, with 55–75% in the missed-session cohort. Brief illness, skipped sets, missed check-ins and pain-limited chest work occur. Recovery and illness are correlated over weeks rather than being completely independent daily coin flips. Typical reported-RIR noise is 0.55 reps, increased to 1.8 in the noisy cohort; the conservative cohort intentionally stops roughly 2.3 reps earlier. A 0.25 kg equivalent equipment increment is a favorable microloading case, while 2.5 kg equivalent is the coarse case. These are equivalent kg/lb values, not a claim that every gym provides fractional dumbbells or exact equivalent plates.

Prescribed muscle targets and normal working sets are held fixed after allocation; PANDR-5 does not silently add sets as recovery or strength changes. Pivot weeks halve sets with rounding up and pause load progression. Chronic symptoms can therefore produce repeated pivot weeks. The model cannot diagnose pain, forecast hypertrophy, or automatically resolve inadequate equipment or bodyweight exercise difficulty.

Latent capacity is tracked per exercise, not through a validated model of muscle growth or transfer between lifts. FSA contributions drive the checked volume totals and a simplified fatigue input, not a physiological growth equation. Beyond-failure finishers retain the app's negative-RIR label but use a zero-RIR effort target in the response generator; assisted repetitions and eccentric fatigue are not separately modeled. These simplifications limit conclusions about the training method even when the app's rules execute correctly.

## Checks and controls

- Exact account restoration and JSON/CSV session and check-in payload round trips.
- Missing-response retries before a record write and after a profile commit.
- Conflicting edits on two devices preserve the winning server state and reject the conflicting write.
- Other accounts cannot read workout/profile rows or insert someone else's records; signed-out profile access is denied.
- Loads remain finite and nonnegative; changes respect the production percentage limits and assistance direction.
- Missing anchors and pivot weeks cannot progress load; completed FSA totals match an independent sum of frozen session credits.
- No unrequested volume increases or duplicate weekly check-ins.
- Sixty paired engine-only sensitivity runs vary response ceilings by 0.5×/1.5× and noise by 0.5×/1.5× for one person from each cohort.
- Twelve additional full-year controls set adaptation to zero, checking whether the app invents upward load drift when latent capacity cannot improve.
- A 200-week stationary-strength negative control uses only random −1/0/+1 rep differences. It measures how often the current automatic performance flag fires without underlying decline. Pairing that flag with poor sleep tests the combined pivot gate.
- Repeated cap-reaching at 10 kg with a 2.5 kg increment must expose the equipment deadlock. A 0.25 kg increment and bodyweight-only progression provide comparators.

## Evidence informing the scenario design

The following support including variability, reporting error and interruptions. They do not calibrate the simulator's one-year coefficients or validate its numerical outputs:

1. Hubal et al. (2005), [Variability in muscle size and strength gain after unilateral resistance training](https://pubmed.ncbi.nlm.nih.gov/15947721/). A large short-term unilateral-arm study found wide responses; those results cannot be directly extrapolated to full-body annual gains.
2. [Proximity to Failure and Total Repetitions Performed in a Set Influences Accuracy of Intraset Repetitions in Reserve-Based Rating of Perceived Exertion](https://pubmed.ncbi.nlm.nih.gov/30747900/) (2019). RIR estimates vary with effort and repetitions. The simulation's Gaussian reporting errors are scenario assumptions.
3. [Does Taking a Break Matter—Adaptations in Muscle Strength and Size Between Continuous and Periodic Resistance Training](https://pubmed.ncbi.nlm.nih.gov/39364857/) (2024). The trial motivates detraining/retraining scenarios; our six-week interruption is not its ten-week protocol.
4. [Repeated Resistance Training Reveals the Reproducibility of Muscle Strength and Size Responses Within Individuals](https://pmc.ncbi.nlm.nih.gov/articles/PMC12659766/) (2025). Supports examining response heterogeneity without treating one observed response as a fixed personal trait.

## Reproduce

Engine-only cohort and sensitivity controls (uses existing app dependencies):

```sh
TZ=UTC npx vitest run --config research/simulation/vitest.config.ts
```

Short smoke run:

```sh
PANDR_SIM_COUNT=1 PANDR_SIM_DAYS=14 TZ=UTC npx vitest run --config research/simulation/vitest.config.ts research/simulation/year.run.ts
```

Full real-backend run: dispatch **One-year synthetic cohort** in GitHub Actions with `count=120`, `days=365`. The workflow pins Supabase CLI 2.117.0, applies `supabase/schema.sql`, runs its isolation check, and then exercises the real app saving path. All synthetic database instances disappear with the runners; final per-account backups and trajectories are preserved in compressed run-log bundles. Only fetch/extract bundles from your own trusted run because they are generated test data. `results/` and `.local/` are ignored; the final report can be committed separately.

Changing assumptions changes simulated outcomes. The correct conclusion is whether the software responds coherently to those inputs and which rules need human review—not that these are the gains real users should expect.

## Collect and inspect a completed run

Download the run's logs with `gh api repos/JCarterJohnson/PANDR-5/actions/runs/RUN_ID/logs` into a ZIP file under `.local/`, then run:

```sh
python3 research/simulation/collect.py research/simulation/.local/run.zip RUN_ID
python3 research/simulation/compare.py
python3 research/simulation/report.py
```

The collector requires all twelve full-year shards, 120 unique identities and participant IDs, 53 calendar-week snapshots per person, matching database profile counts and valid backup checksums. The report generator also needs the engine-only `results/probes/probes.json` from the sensitivity run and Matplotlib 3.11.2. Its output is in `report/`; open `index.html` for the chart and overview or `REPORT.md` for the full findings. Full backups remain local under `results/verified/accounts/`. GitHub logs expire according to the repository's retention settings, so retain the collected local evidence.

`compare.py` requires a full engine-only run with the same seed and assumptions. It compares all account outcome fields, weekly observations and individual exercise trajectories against the backend run, excluding random authentication identifiers and serialized-backup sizes/checksums. This checks that synchronization and restoration did not change training decisions.

The 365-day run contains 52 complete weeks and one day in week 53. The response generator updates latent capacity at each week boundary and once for the final partial week. That final update is not prorated by day count; it affects the final latent-capacity summary, not subsequent working-load prescriptions, because no later session is simulated.
