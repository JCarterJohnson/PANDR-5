# PANDR-5 coaching refinement audit

The original audit remains in `research/simulation/report/` and its ignored full data in `research/simulation/results/verified/`. This follow-up keeps separate results and compares the original controller at commit `12c12b8` with the refined production controller. `baseline/` contains the exact original domain engine/training files with import paths relocated, so no new rule leaks into the comparator. Original spreadsheet records and catalog allocations remain unchanged.

## Reproduce

From the App root:

```sh
TZ=UTC npx vitest run --config research/simulation/vitest.config.ts
```

This creates ignored results here: 120 production-engine people-years; 480 matched baseline/refined people-years across the original and held-out seed families; 12 uncalibrated comparisons; 60 response/noise sensitivity runs; 12 zero-adaptation controls; and detector-only controls. The same production completion/check-in helpers are called by the UI and refined simulations.

Both sides use the original latent-capacity, fatigue and adaptation equations. Random streams were separated by life week, attendance day, check-in day and exercise/set so prescriptions cannot change future sleep or attendance draws. A paired-input assertion verifies identical sleep, pain, schedules and attendance. The old audit’s exact numeric outcomes therefore differ from the rerun comparator; the report keeps them distinct. No coefficients in the simulated biology were fitted to the new controller. The independent seed offset is 900000.

The original simulator’s bodyweight assumption (70% of simulated mass) is exposed as a known synthetic measurement to both controllers. This is a laboratory setup for these fake people, never a default or a recommendation in the app. The calibration ablation separately leaves that setup absent. Ordinary external lifts in the coarse-equipment cohort retain the original 2.5 kg grid. The calibrated bodyweight setups have separately declared 1.25 kg added/assistance options in both comparator arms; their results do not imply that coarse external equipment is solved. Confirmed smaller steps are exercised in separate equipment tests.

The detector controls hold physiology, load, RIR and prescriptions constant for 40 independent people under ±0/1/2-rep noise. Separate abrupt and gradual deterioration cases report detection delays as well as false flags. Higher-noise failures must remain visible; no synthetic result establishes clinical accuracy or human hypertrophy outcomes.

## Actual account storage

Dispatch `.github/workflows/simulation.yml` with 120 accounts and 365 days. Twelve standard public GitHub runners start their own local Supabase instances and install the production schema/RLS. They test real Auth, session/check-in saves, fresh-account restoration, cross-account isolation, dropped writes/acknowledgments, conflicting devices, and exact CSV/backup round trips. The script refuses hosted database URLs. It creates no production users and sends no emails.

The runner emits compressed synthetic-only evidence in logs; it does not use paid artifact storage. Retrieve the complete run log archive, then run:

```sh
python3 research/simulation/collect.py PATH_TO_LOG_ARCHIVE RUN_ID
python3 research/simulation/compare.py
```

The collector validates all 12 shards, all 120 account backups, checksums and weekly coverage. The parity comparison checks every summary, week and exercise snapshot against the local production-engine run. Results go to `research/coaching-refinements/results/verified/`; prior audit evidence is kept.

## Results

[Read the completed report](report/REPORT.md) or open `report/report.html` for the standalone visual report. [Download the complete synthetic evidence bundle](https://github.com/JCarterJohnson/PANDR-5/releases/download/v0.4.0/PANDR-5-0.4.0-coaching-audit.zip) for all 120 restored account backups and the paired/controller-control data. No real user records or authentication credentials are included.

To regenerate the report after collecting and comparing the data, use Python with matplotlib installed and run `python3 research/coaching-refinements/report.py`. The source run used Python 3.14 and matplotlib 3.11.2. Every evidence file has a SHA-256 checksum in `report/evidence-checksums.json`.
