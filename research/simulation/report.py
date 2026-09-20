"""Build the reviewable report from collected, verified synthetic account evidence."""
import csv
import gzip
import html
import json
import statistics as stats
from collections import defaultdict
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root=Path(__file__).parent
source=root/'results'/'verified'
verified=json.loads((source/'summary.json').read_text())
parity=json.loads((source/'parity.json').read_text())
assert parity['matchingAccounts']==120 and parity['runUrl']==verified['runUrl']
accounts=verified['accounts'];reports=verified['reports']
weekly=list(csv.DictReader((source/'weekly.csv').open()))
lifts=list(csv.DictReader(gzip.open(source/'lifts.csv.gz','rt')))
probes=json.loads((root/'results'/'probes'/'probes.json').read_text())
output=root/'report';output.mkdir(exist_ok=True)
# Retain small, reviewable evidence in Git even after the remote run logs expire.
(output/'account-summary.csv').write_bytes((source/'accounts.csv').read_bytes())
(output/'control-evidence.json').write_text(json.dumps(probes,indent=2))
(output/'backend-evidence.json').write_text(json.dumps({
    'runUrl':verified['runUrl'],
    'engineBackendParity':parity,
    'reports':[{key:value for key,value in report.items() if key!='accounts'} for report in reports]
},indent=2))
groups=defaultdict(list)
for person in accounts:groups[person['cohort']].append(person)
cohorts=list(groups)
def median(rows,key):return stats.median(r[key] for r in rows)
def total(key):return sum(r[key] for r in accounts)
def metric(key):return sum(r['metrics'][key] for r in reports)
curve=defaultdict(list)
for row in lifts:
    if row['mode']=='external':
        curve[(int(row['person']),int(row['week']))].append((float(row['loadKg'])/float(row['initialKg'])-1)*100)
by_person={}
for a in accounts:
    by_person[a['person']]=[stats.mean(curve[(a['person'],week)]) for week in range(1,54)]

plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False,'axes.titleweight':'bold','axes.labelcolor':'#40506a','xtick.color':'#40506a','ytick.color':'#40506a','figure.facecolor':'#ffffff'})
fig,axes=plt.subplots(4,3,figsize=(13,12),sharex=True,sharey=True)
for ax,cohort in zip(axes.flat,cohorts):
    people=groups[cohort]
    for a in people:ax.plot(range(1,54),by_person[a['person']],color='#b8cbe8',lw=.8,alpha=.8)
    ax.plot(range(1,54),[stats.median(by_person[a['person']][week-1] for a in people) for week in range(1,54)],color='#155be8',lw=2)
    ax.axhline(0,color='#777777',lw=.6,ls='--');ax.grid(axis='y',alpha=.13)
    ax.set_title(cohort.replace('-',' ').capitalize(),loc='left',fontsize=11)
    ax.set_ylim(-15,75);ax.set_xlim(1,53);ax.set_xticks([1,13,26,39,53])
fig.suptitle('120 synthetic lifters · 365 days',x=.07,ha='left',fontsize=21)
fig.text(.07,.947,'External working-load change, averaged within each person. Thin lines: individuals; blue: cohort median.',fontsize=10,color='#40506a')
fig.supxlabel('Training calendar week (week 53 contains only the final day)',y=.035)
fig.supylabel('Change from starting external working loads (%)',x=.015)
fig.text(.07,.006,'SIMULATED SCENARIOS — not measured strength gains or expected human outcomes. Ten people per selected scenario.',fontsize=9,color='#7a3e22')
fig.tight_layout(rect=(.035,.045,1,.93));fig.savefig(output/'year-trajectories.png',dpi=170);fig.savefig(output/'year-trajectories.svg');plt.close(fig)
svg=output/'year-trajectories.svg'
svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines())+'\n')

rows=[]
for cohort,people in groups.items():
    recs=sum(p['increases']+p['decreases']+p['holds'] for p in people)
    anchors=sum(p['anchorCount'] for p in people)
    pweeks=[sum(w['pivot']=='True' or w['pivot']=='true' for w in weekly if int(w['person'])==p['person']) for p in people]
    rows.append({'cohort':cohort,'people':len(people),'median_sessions':median(people,'trained'),'median_working_load_change_pct':median(people,'loadChangePct'),'minimum_change_pct':min(p['loadChangePct'] for p in people),'maximum_change_pct':max(p['loadChangePct'] for p in people),'median_pivot_weeks':stats.median(pweeks),'equipment_hold_pct':100*sum(p['roundingHolds'] for p in people)/recs,'anchor_below_floor_pct':100*sum(p['underFloor'] for p in people)/anchors})
with (output/'cohort-summary.csv').open('w') as stream:
    writer=csv.DictWriter(stream,fieldnames=rows[0]);writer.writeheader();writer.writerows(rows)
table='\n'.join(f"| {r['cohort']} | {r['median_sessions']:.0f} | {r['median_working_load_change_pct']:+.1f}% | {r['minimum_change_pct']:+.1f} to {r['maximum_change_pct']:+.1f}% | {r['median_pivot_weeks']:g} | {r['equipment_hold_pct']:.1f}% |" for r in rows)
negative=probes['negativeControls']
coarse=next(r for r in rows if r['cohort']=='coarse-equipment')
sleep=next(r for r in rows if r['cohort']=='poor-sleep')
conservative=next(r for r in rows if r['cohort']=='conservative-effort')
novice=[r for r in probes['assumptions'] if r['cohort']=='novice' and r['variant'] in ('half-response','base','higher-response')]
comparison=', '.join(f"{r['variant']}: {r['loadChangePct']:+.1f}%" for r in novice)
zero_changes=[person['loadChangePct'] for person in probes['zeroAdaptation']]
p95=[r['metrics']['saveP95Ms'] for r in reports]
stored=sum(r['database']['immutableRecordVersions'] for r in reports)
readable=f'''# PANDR-5: one-year simulation audit

## Result

**The account and progression software completed the test. The stronger claim that it can manage every lifter's training automatically is not supported.** The current rules are coherent in several important ways, but equipment limitations, reporting noise, repeated recovery problems and bodyweight progression still require human decisions.

Completed **120 synthetic accounts × 365 days**, **{total('trained'):,} workouts**, **{total('checks'):,} check-ins**, and **{total('increases')+total('decreases')+total('holds'):,} exercise recommendations**. No production users or training data were used. [Completed backend run]({verified['runUrl']}). Tested application commit: `{reports[0]['codeCommit']}`.

These numbers describe invented participants under explicit assumptions. They do not estimate expected gains, prove safety, measure hypertrophy, compare PANDR-5 with another program, or substitute for observing real users.

![Individual trajectories](year-trajectories.png)

## What a year looked like

“Working-load change” is the average percentage change across a person's externally loaded exercise slots. It is **not a measured 1RM gain**, a pooled average of kilograms across different exercises, or a muscle-gain estimate. Assistance and bodyweight slots are excluded from this particular summary but included in the actual sessions and checks. Each row contains ten deliberately chosen scenario participants; this is not a representative population sample.

| Scenario | Median workouts | Median working-load change | Individual range | Median pivot weeks | Recommendations held by equipment |
|---|---:|---:|---:|---:|---:|
{table}

Normal weekly set allocations stayed fixed. Pivot weeks reduced sets and paused load progression. Missed training and a six-week interruption created gaps rather than invented catch-up workouts; a new cycle preserved earlier history. Working loads sometimes stayed flat or decreased. There was no unbounded exponential increase.

## Practical findings

### 1. The automatic performance flag is sensitive to ordinary noise

In an independent control, underlying strength, loads, effort targets and training prescriptions were unchanged. Anchor repetitions varied randomly by only −1/0/+1. The current “decline on at least two exercises” flag fired in **{negative['stationaryMeasuredFlags']} of {negative['stationaryWeeks']} evaluated weeks**.

This flag alone does **not** cause a pivot. With poor sleep also checked, however, the same control met the next-week pivot rule in **{negative['stationaryPlusPoorSleepPivots']} of {negative['stationaryWeeks']} weeks**. With many exercise slots, two small downward comparisons are easy to obtain by chance. This is a negative-control finding, not a real-world false-positive rate. The control keeps prescriptions fixed to isolate the detector; it is not a full closed-loop pivot simulation.

Recommendation: review the automatic corroboration rule before describing it as reliable evidence of declining performance. A repeated trend and a meaningful-change requirement are candidates for testing. No new cutoff was silently substituted during this audit, and any change should be reconciled with the source model and tested prospectively.

### 2. Equipment can block progression indefinitely

At 10 kg with 2.5 kg steps, the next increment is 25%, outside the model's permitted increase. Even repeated successful cap-reaching therefore returns “hold”; the 12-exposure control remained at 10 kg throughout. With 0.25 kg steps, the same performance produces an increase.

In the coarse-equipment cohort, **{coarse['equipment_hold_pct']:.1f}% of all exercise recommendations** held because no valid increment existed. Small reductions can also be impossible. This follows the specified percentage rules, so passing the formula tests does not solve the practical problem. The app already explains the hold, but cannot supply equipment the user lacks. A reviewed fallback or a clearer setup intervention is needed for hands-off use.

### 3. Chronic poor recovery can mean repeated pivot weeks

The poor-sleep scenario had a median of **{sleep['median_pivot_weeks']:g} pivot weeks** out of the simulated year. That is understandable under repeated symptoms, but the app does not automatically redesign the five-day schedule or ordinary volume. In this scenario, **{sleep['anchor_below_floor_pct']:.1f}%** of completed progression anchors were below the rep floor. Continued check-ins do not resolve the underlying sleep/recovery constraint.

### 4. The system needs believable effort reporting and some manual choices

The conservative-effort cohort intentionally stopped earlier than prescribed. Its median working-load change was **{conservative['median_working_load_change_pct']:+.1f}%**, with **{conservative['anchor_below_floor_pct']:.1f}%** of completed anchors below the rep floor. Many anchors could not satisfy the required RIR condition. This is not proof that those people cannot improve; it shows how strongly the prescription depends on its effort input.

Bodyweight movements can exceed the repetition cap while the app correctly keeps external load at zero. Users must choose added load, assistance changes or a harder variation themselves. Pain-limited work was skipped by the simulated lifter; the simulation did not test whether continuing through pain is safe.

## Account/storage verification

- **120 distinct real test Auth accounts** across twelve isolated local Supabase databases; all 120 profiles and **{stored:,} immutable record versions** were counted on the databases.
- **{metric('saves'):,} successful routine production-code sync checkpoints**, including **{metric('fullSetSaves'):,} individual-set saves** in sampled first/last full weeks, plus the separate conflict checks. Every completed workout and check-in was saved; every individual set-save was not replayed for every account.
- **{metric('reloads'):,} successful fresh-memory/fresh-client restorations**, with full data equality checks.
- **{metric('failedWritesRecovered')} pre-write failures** and **{metric('lostResponsesRecovered')} lost acknowledgements after commit** recovered without losing session history.
- **{metric('conflictsDetected')} two-device conflicts** were detected and the winning server data preserved.
- **{metric('isolationChecks')} account-isolation assertions** passed, including denied cross-account inserts and anonymous reads.
- All 120 final JSON backups and all-time CSV session/check-in payloads round-tripped. Every collected backup's SHA-256 checksum and record counts were independently checked after downloading the run logs.
- Normal-volume invariance, FSA sums, assistance direction, valid percentage steps, incomplete-anchor holds, pivot holds, cycle ownership and weekly check-in uniqueness passed.
- All 120 account outcome summaries, **{parity['matchingRows']['weekly.csv']:,} weekly observations**, and **{parity['matchingRows']['lifts.csv.gz']:,} per-exercise snapshots** exactly matched the equivalent engine-only run. Saving and restoring accounts did not change the simulated training decisions.

The per-runner 95th-percentile save times ranged from **{min(p95):.0f} to {max(p95):.0f} ms**. These include validation, hashing, data merging and local HTTP/database calls. They are not production latency or a concurrent-user benchmark. Across the runs, the instrumented clients sent approximately **{metric('requestBytes')/1e9:.2f} GB** and received **{metric('responseBytes')/1e9:.2f} GB** of HTTP bodies, including injected failures and reads. Immutable workout payloads are incremental, but profile metadata and the history manifest still travel repeatedly. That matters when considering free-hosting capacity over time; this audit does not establish that live quotas will support unlimited users.

## How much the assumptions matter

Sixty paired sensitivity runs changed response ceilings and noise while keeping seeds/scenarios matched. For one novice, the three response assumptions produced **{comparison}**. The simulator can readily change the annual gain by changing its biological assumptions. That is why numerical similarity to a plausible human outcome is a screening check, not scientific validation.

An additional twelve full-year controls set adaptation to zero, one participant per scenario. Average external working-load changes ranged from **{min(zero_changes):+.1f}% to {max(zero_changes):+.1f}%**; none showed an average increase. This is a useful check against automatic upward drift when the participant does not become stronger. It is still conditional on this particular simulator, and does not establish that the app always detects nonresponse in humans.

The simulator uses diminishing latent capacity growth, fatigue, missed work, illness, RIR error and a simple detraining mechanism. The detailed equations, parameter ranges, limitations and primary research supporting the scenario choices are in [the methodology](../README.md). The default source exercises and one custom three-day schedule were exercised; this is not exhaustive coverage of all 372 catalog entries, every training plan, or every browser interaction. The existing 125 app tests also passed during the audit.

## Files and reproduction

- [Cohort summary CSV](cohort-summary.csv)
- [All 120 account summaries](account-summary.csv)
- [Backend verification totals](backend-evidence.json)
- [Sensitivity and negative-control evidence](control-evidence.json)
- [Full methods and rerun instructions](../README.md)
- Local full evidence: `research/simulation/results/verified/` contains account and weekly CSVs, compressed per-lift trajectories, the combined backend report and **120 compressed complete account backups**. These large generated files are ignored by Git but preserved in the completed run's synthetic log bundles.
- Local sensitivity/control evidence: `research/simulation/results/probes/probes.json`.
- The app's progression rules and real production records were not changed to obtain a passing simulation.

## Assessment

**Suitable as a transparent, rule-based training log with guided progression; not yet demonstrated as a fully hands-off adaptive coach.** The highest-priority review is noise sensitivity in automatic performance corroboration, followed by equipment deadlocks and repeated-pivot guidance. After those decisions are addressed, a small prospective real-user pilot with clearly defined outcomes would test what simulation cannot: adherence, usability, tolerability and actual training results.
'''
(output/'REPORT.md').write_text(readable)
# A compact offline view; the full report remains the canonical explanation.
html_rows=''.join('<tr>'+''.join(f'<td>{html.escape(str(v))}</td>' for v in [r['cohort'],int(r['median_sessions']),f"{r['median_working_load_change_pct']:+.1f}%",f"{r['minimum_change_pct']:+.1f}–{r['maximum_change_pct']:+.1f}%",r['median_pivot_weeks'],f"{r['equipment_hold_pct']:.1f}%"] )+'</tr>' for r in rows)
(output/'index.html').write_text(f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>PANDR-5 simulation audit</title><style>body{{font:16px/1.6 system-ui,sans-serif;color:#192338;max-width:1120px;margin:40px auto;padding:0 24px;background:#fff}}h1{{font-size:38px;line-height:1.15}}h2{{margin-top:36px}}.note{{background:#fff4e5;border-left:4px solid #ba7423;padding:16px}}.stats{{display:flex;flex-wrap:wrap;gap:30px;margin:28px 0}}.stats b{{display:block;font-size:30px}}img{{width:100%;height:auto}}table{{border-collapse:collapse;width:100%;font-size:14px}}td,th{{padding:10px;border-bottom:1px solid #e1e6ee;text-align:left}}.scroll{{overflow:auto}}a{{color:#155be8}}li{{margin:10px 0}}</style><h1>A year of PANDR-5, simulated</h1><p>120 synthetic lifters · 365 days · real isolated account storage</p><div class="note">These are invented scenarios, not human trial results or forecasts. The storage and progression checks passed; the audit also found practical limits to hands-off coaching.</div><div class="stats"><div><b>120</b>test accounts</div><div><b>{total('trained'):,}</b>workouts</div><div><b>{total('checks'):,}</b>check-ins</div><div><b>{metric('saves'):,}</b>confirmed saves</div></div><img src="year-trajectories.png" alt="Twelve charts showing the 365-day external working-load trajectories for ten synthetic participants in each scenario"><h2>What deserves attention</h2><ul><li>Ordinary ±1-rep noise generated a performance flag in {negative['stationaryMeasuredFlags']}/{negative['stationaryWeeks']} stationary-strength control weeks. It becomes a pivot trigger when paired with poor sleep.</li><li>Coarse equipment blocked {coarse['equipment_hold_pct']:.1f}% of recommendations in that scenario.</li><li>Recurring poor sleep produced a median of {sleep['median_pivot_weeks']:g} pivot weeks, without automatically redesigning the routine.</li><li>Bodyweight difficulty and effort reporting still need user judgment.</li></ul><h2>Scenario results</h2><p>External working-load changes, not measured 1RM or muscle gains. Ten simulated people per row.</p><div class="scroll"><table><thead><tr><th>Scenario</th><th>Workouts (median)</th><th>Load change (median)</th><th>Individual range</th><th>Pivot weeks (median)</th><th>Equipment holds</th></tr></thead><tbody>{html_rows}</tbody></table></div><h2>Evidence</h2><p><a href="REPORT.md">Full audit report</a> · <a href="cohort-summary.csv">Summary CSV</a> · <a href="{verified['runUrl']}">Completed backend run</a></p><p>The account backups, detailed trajectories and sensitivity controls are saved alongside the research files. No live users or production training records were changed.</p></html>''')
print(output/'REPORT.md')
