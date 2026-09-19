# Recovery check-ins: evidence and implementation

Reviewed September 18, 2026. The app uses research to choose useful observations and expose uncertainty. It does not train a prediction model or claim that a rating predicts an individual's hypertrophy.

## Primary research

| Source | Study and finding | App use and limit |
| --- | --- | --- |
| [Gastin, Meyer & Robinson, 2013](https://pubmed.ncbi.nlm.nih.gov/23249820/) | Observational monitoring of 27 elite Australian football players using subjective wellness measures. Ratings provided information about responses to training and competition. | Track fatigue, soreness, stress and sleep relative to the user's own previous entries. Football monitoring does not supply calibrated thresholds for recreational resistance training. |
| [Saner et al., 2020](https://pubmed.ncbi.nlm.nih.gov/32078168/) | Controlled study of 24 healthy young men; five nights of four hours in bed reduced myofibrillar protein synthesis compared with normal sleep. | Repeated poor sleep is a recovery flag. No conversion of self-reported hours to a personal protein-synthesis or muscle-growth percentage. The experiment's HIIE intervention is not used to recommend extra exercise to tired users. |
| [Coleman et al., 2024](https://pubmed.ncbi.nlm.nih.gov/38274324/) | Randomized resistance-training study, 39 completers, comparing a week of cessation within nine weeks with continuous training. No appreciable hypertrophy advantage; continuous training improved strength more. | Clearly distinguish a PANDR-5 half-set pivot from complete cessation. Neither this study nor its dataset validates a two-flag trigger or an exact 50% reduction. |

## Public dataset inspected

The Coleman paper identifies [OSF project KDGV3](https://osf.io/kdgv3/) (DOI [10.17605/OSF.IO/KDGV3](https://doi.org/10.17605/OSF.IO/KDGV3)). Its public file listing includes `Dataset Deload.xlsx`, a readiness-to-train questionnaire, the program, and an analysis checklist.

The dataset download is [OSF file cwg9q](https://osf.io/download/cwg9q/). SHA-256 of the file inspected: `51106b0563b9c7f719805a64b839614e2fd19503806c09cdbca19668ad9c4c5c`.

Read-only inspection of sheet `Deload Data`, columns A:AG, found 39 nonempty participant rows and 33 named columns. Group codes contained 18 and 21 records; no group-label inference was needed. Fields include participant code, group, sex, pre/post muscle measurements, body composition, countermovement jump, isometric strength, 1RM and endurance. The workbook's declared extent includes many empty columns; those are not additional variables.

There are no linked weekly sleep, fatigue, soreness, stress or resting-heart-rate observations among the named fields. This dataset cannot fit or validate a per-check-in readiness-to-growth prediction. No participant records are shipped in the app, no questionnaire scoring system is copied, and no coefficients are fitted from this dataset. The public dataset and paper are linked in The method for inspection.

## Deterministic rules implemented

- Check-in is available only on the configured local weekday, once per cycle week. The default is the plan's last rest day. The local calendar refreshes every second and on focus/visibility changes. No missed-day popup or out-of-date modal submission is accepted.
- Optional mean sleep hours and 1–5 fatigue, soreness and stress ratings are stored as observations. Comparisons use up to four preceding check-ins in the same cycle and require two actual prior measurements. Missing is not zero. Ratings alone do not prescribe a load change.
- The user flags repeated poor sleep, declining performance and joint pain. Two of these categories schedule the next cycle week's pivot, preserving the existing PANDR-5 rule. Reported and measured performance decline count as one category.
- Logged corroboration compares the current week's completed progression anchor with its preceding exposure in the same cycle. It requires equal exercise/slot, load, unit, load mode, set count, rep range and RIR prescription, with fewer reps at equal or greater reported effort. Pivot sessions and incomplete anchors are excluded. At least two distinct exercises are required to supply the performance category. This is an explicit app heuristic, not a validated statistical cutoff. Evidence strings and assessment version are frozen in the saved check-in.
- Pivot sets are halved and rounded up, and progression is paused for that week. Normal rules resume the following week. Previous cycles' check-ins cannot trigger a pivot in a new cycle.
- Poor sleep, feeling run-down, raised usual resting HR or limiting soreness guide passive recovery under the source model. Joint pain overrides generic cardio advice with avoiding painful loading and seeking assessment if persistent or worsening.

The precise flags and intervention remain model decisions. Users see them before saving and can inspect the observations in History and their export. No causal growth estimates, injury probabilities, automatic volume escalation, or proprietary readiness score are presented.

## Reproduction and verification

The article's full-text XML is publicly available at [Europe PMC](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC10809978/fullTextXML). The [OSF file API](https://api.osf.io/v2/nodes/kdgv3/files/osfstorage/) enumerates the source files. The workbook was read without modification; empty rows and columns were excluded from the coverage count only.

`src/domain/training.test.ts` covers cycle ownership, midnight/DST scheduling, duplicate check-ins, completed-set credits, comparable-performance exclusions, missing ratings and backup retention. Browser tests verify date rollover, prompt visibility, and next-week pivot behavior through the actual UI.
