"""Render comparison evidence without changing the simulator or production policy."""
import base64
import csv
import hashlib
import html
import json
import re
import statistics as stats
from collections import Counter
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root=Path(__file__).parent
results=root/'results'; output=root/'report'; output.mkdir(exist_ok=True)
paired=json.loads((results/'controlled/paired.json').read_text())
detector=json.loads((results/'controlled/detector.json').read_text())['rows']
probes=json.loads((results/'probes/probes.json').read_text())
engine=json.loads((results/'dry-run/summary.json').read_text())
backend=json.loads((results/'verified/summary.json').read_text()) if (results/'verified/parity.json').exists() else None
accounts=paired['accounts']; weeks=paired['weekly']
assert len(accounts)==480 and len(engine['accounts'])==120
median=lambda xs: stats.median(list(xs))
def write_csv(name, rows):
 with (output/name).open('w',newline='') as f:
  writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
write_csv('paired-accounts.csv',accounts);write_csv('detector-controls.csv',detector)
noise_rows=[]
for noise in range(3):
 rows=[r for r in detector if r['noise']==noise and r['scenario']=='stationary']
 denominator=sum(r['eligibleWeeks'] for r in rows)
 noise_rows.append({'noise':noise,'eligibleWeeks':denominator,'baselineFalseFlags':sum(r['oldFlags'] for r in rows),'refinedFalseFlags':sum(r['newFlags'] for r in rows)})
cohorts=[]
for sample in ['original','held-out']:
 for cohort in dict.fromkeys(a['cohort'] for a in accounts):
  row={'sample':sample,'cohort':cohort}
  for algorithm in ['baseline','refined']:
   people=[a for a in accounts if a['sample']==sample and a['cohort']==cohort and a['algorithm']==algorithm]
   observations=[w for w in weeks if w['sample']==sample and w['cohort']==cohort and w['algorithm']==algorithm]
   pivots=Counter(w['person'] for w in observations if w['pivot'])
   row[algorithm+'PivotWeeks']=median(pivots.get(a['person'],0) for a in people)
   row[algorithm+'ExternalLoadChangePct']=median(a['loadChangePct'] for a in people)
   row[algorithm+'Week52NormalSets']=median(w['normalSets'] for w in observations if w['week']==52)
  cohorts.append(row)
write_csv('cohort-comparison.csv',cohorts)
poor=[r for r in cohorts if r['cohort']=='poor-sleep']
ordinary=noise_rows[1]; high=noise_rows[2]
old_pct=100*ordinary['baselineFalseFlags']/ordinary['eligibleWeeks']; new_pct=100*ordinary['refinedFalseFlags']/ordinary['eligibleWeeks']; high_pct=100*high['refinedFalseFlags']/high['eligibleWeeks']
transitions=sum(a['bodyweightTransitions'] for a in accounts if a['algorithm']=='refined')
reductions=sum(a['recoveryReductions'] for a in accounts if a['algorithm']=='refined'); restorations=sum(a['recoveryRestorations'] for a in accounts if a['algorithm']=='refined')
minimums=sum(a['recoveryMinimums'] for a in accounts if a['algorithm']=='refined')
no_growth=max(a['loadChangePct'] for a in probes['zeroAdaptation'])
latency={scenario:median(r['newFirst']-10 for r in detector if r['noise']==0 and r['scenario']==scenario) for scenario in ['abrupt','gradual']}

plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False,'axes.labelcolor':'#17233e','text.color':'#17233e'})
fig,axes=plt.subplots(1,3,figsize=(15,4.6));fig.patch.set_facecolor('white');old='#a1a8b3';new='#1769ef'
for offset,algorithm,color,key in [(-.18,'Original',old,'baselineFalseFlags'),(.18,'Refined',new,'refinedFalseFlags')]:
 axes[0].bar([n+offset for n in range(3)],[100*r[key]/r['eligibleWeeks'] for r in noise_rows],width=.34,label=algorithm,color=color)
axes[0].set(xticks=[0,1,2],xticklabels=['No noise','±1 rep','±2 reps'],ylabel='Weeks with a false performance flag (%)',ylim=(0,110),title='Steady performance: false flags')
axes[0].legend(frameon=False)
for x,r in enumerate(poor):
 axes[1].plot([x-.16,x+.16],[r['baselinePivotWeeks'],r['refinedPivotWeeks']],color='#c8ced8',lw=2)
 axes[1].scatter(x-.16,r['baselinePivotWeeks'],color=old,s=65);axes[1].scatter(x+.16,r['refinedPivotWeeks'],color=new,s=65)
 axes[1].annotate(str(r['baselinePivotWeeks']),(x-.16,r['baselinePivotWeeks']),xytext=(-12,8),textcoords='offset points')
 axes[1].annotate(str(r['refinedPivotWeeks']),(x+.16,r['refinedPivotWeeks']),xytext=(0,-17),textcoords='offset points')
axes[1].set(xticks=[0,1],xticklabels=['Original seed family','Held-out seed family'],ylabel='Median pivot weeks per simulated year',ylim=(0,35),title='Recurring poor sleep still matters')
for algorithm,color in [('baseline',old),('refined',new)]:
 observations=[w for w in weeks if w['sample']=='original' and w['cohort']=='poor-sleep' and w['algorithm']==algorithm]
 axes[2].step(range(1,53),[median(w['normalSets'] for w in observations if w['week']==i) for i in range(1,53)],where='post',color=color,lw=2,label=algorithm.title())
axes[2].set(xlabel='Training week',ylabel='Median normal weekly working sets',title='Underlying dose adjusts within bounds',ylim=(0,135));axes[2].legend(frameon=False)
fig.suptitle('PANDR-5 coaching refinement: controlled simulation results',fontsize=16,fontweight='bold',x=.02,ha='left')
fig.text(.02,.02,'Synthetic stress tests, not measured human outcomes. Pivot weeks temporarily halve the adjusted prescription. Higher-noise limits remain visible.',fontsize=9,color='#59677e')
fig.tight_layout(rect=(0,.06,1,.91));fig.savefig(output/'comparison.png',dpi=170);fig.savefig(output/'comparison.svg');plt.close(fig)

if backend:
 reports=backend['reports'];metrics=Counter()
 for r in reports:
  for k,v in r['metrics'].items():
   if isinstance(v,(int,float)) and k not in ['saveP50Ms','saveP95Ms','elapsedSeconds']:metrics[k]+=v
 parity=json.loads((results/'verified/parity.json').read_text())
 assert parity['matchingAccounts']==120
 verification=f"The [real account run]({backend['runUrl']}) passed all 12 shards: 120 separate Auth accounts, {sum(a['trained'] for a in backend['accounts']):,} workouts, {sum(a['checks'] for a in backend['accounts']):,} check-ins, {metrics['saves']:,} cloud saves, {metrics['fullSetSaves']:,} individual-set saves and {metrics['reloads']:,} fresh restores. All {parity['matchingRows']['weekly.csv']:,} weekly and {parity['matchingRows']['lifts.csv.gz']:,} exercise snapshots exactly matched the production-engine run. {metrics['failedWritesRecovered']} pre-write failures, {metrics['lostResponsesRecovered']} lost acknowledgments and {metrics['conflictsDetected']} device conflicts recovered as expected; {metrics['isolationChecks']} isolation assertions passed. Every account passed exact session/check-in CSV and full-backup round trips. No production users or votes were changed."
 (output/'backend-verification.json').write_text(json.dumps({'run':backend['runUrl'],'parity':parity,'metrics':dict(metrics),'databaseVersions':sum(r['database']['immutableRecordVersions'] for r in reports),'codeCommits':sorted({r['codeCommit'] for r in reports})},indent=2))
else:
 verification='PENDING: the real isolated-account run has not been collected and matched yet. No backend completion claim is made in this draft.'

lines=[
 '# PANDR-5 coaching refinements: results',
 '',
 'Implemented within the existing split, fractional credits, rep/RIR rules, 2–5% increases, 2–3% reductions and two-flag pivot rule. The extra trend and recovery thresholds are documented app policies informed by research; they are not validated physiological cutoffs.',
 '',
 '![Controlled comparison](comparison.png)',
 '',
 '## What changed',
 '',
 '- Performance: a confirmed drop or repeated downward trend across five comparable exposures replaces a single lower anchor. Changed prescriptions, missing anchors and long gaps reset the comparison. Reports from the user still count.',
 '- Equipment: exact lists of real loads and visible adjustment requirements replace ambiguous rounding holds. Hardware gaps are never filled with an oversized jump or fictional microplates.',
 '- Bodyweight: recorded resistance plus confirmed added/assistance options can progress through assisted, unassisted and added-weight modes. One-time setup is necessary; the app never supplies a universal body-mass fraction.',
 '- Recovery: repeated qualifying trouble allows small normal-volume reductions within 10–20 effective sets for selected muscles. Restored recovery and attendance allow slow restoration to the saved plan. Adjustments start next week. Early RIR targets and the exact anchor/finisher are preserved. Pivots still apply; original plan counts remain the ceiling.',
 '',
 '## What the comparisons show',
 '',
 f'With ordinary ±1-rep noise and no real decline, the original detector flagged {ordinary["baselineFalseFlags"]:,}/{ordinary["eligibleWeeks"]:,} eligible weeks ({old_pct:.2f}%). The refined detector flagged {ordinary["refinedFalseFlags"]:,}/{ordinary["eligibleWeeks"]:,} ({new_pct:.2f}%). This is a controlled synthetic false-flag rate, not a human diagnostic accuracy estimate.',
 '',
 f'All 40 clear abrupt-decline controls and all 40 clear gradual-decline controls were detected. In the noiseless examples, detection followed the onset by {latency["abrupt"]:g} weekly exposure for an abrupt drop and {latency["gradual"]:g} for a gradual decline. Requiring confirmation costs time. With ±2-rep stationary noise, false flags still occurred in {high["refinedFalseFlags"]}/{high["eligibleWeeks"]} weeks ({high_pct:.2f}%); the rule is not robust to every noisy logging pattern.',
 '',
 '| Poor-sleep group | Original controller: median pivot weeks | Refined controller | Normal sets at week 52, original → refined |',
 '|---|---:|---:|---:|',
 *[f'| {r["sample"]} seeds | {r["baselinePivotWeeks"]:g} | {r["refinedPivotWeeks"]:g} | {r["baselineWeek52NormalSets"]:g} → {r["refinedWeek52NormalSets"]:g} |' for r in poor],
 '',
 'The recurring-sleep problem is only partially resolved. The controller reduces a repeatedly excessive dose, but does not suppress symptoms or break the volume floor to make pivot counts look better. The previous audit’s median of 25 weeks came from the original single-stream harness; the matched rerun baseline above uses the corrected independent streams. These numbers must not be mixed as if the inputs were identical.',
 '',
 'The sleep scenario is deliberately harsh and uncalibrated. Its fatigue recurrence includes a 0.45 poor-sleep penalty with 0.48 carryover; under continuously poor sleep, even a hypothetical zero-training steady state produces readiness around 0.907, below the simulator’s 0.91 reporting threshold. That arithmetic explains why training-volume changes alone cannot erase many flags in this simulator. It does not establish that a real person needs this many reduced weeks.',
 '',
 f'Across the 240 refined people-years there were {reductions} bounded reductions, {restorations} restorations and {minimums} check-ins that correctly reported no further valid whole-set reduction. Calibrated bodyweight setups produced {transitions} mode transitions; separate tests cover assistance → unassisted → added load and the reverse direction. All recommended changes stayed inside the source percentage limits.',
 '',
 'A 10 kg working load with only 2.5 kg steps still stays at 10 kg after 12 successful cap exposures: 12.5 kg is a 25% jump. Providing a real 10.25 kg option permits 2.5% progression. This is an honest physical requirement, not an algorithmic stall that repeated success can overcome.',
 '',
 f'The 12 zero-adaptation controls acquired no positive latent capacity. Their highest person-level mean external-load change was {no_growth:.3f}%. The report also retains 60 response/noise sensitivity runs and 12 uncalibrated bodyweight comparisons. Better-looking load numbers were not a passing condition.',
 '',
 '## Verification',
 '',
 '155 automated checks passed, including original-source parity, recovery floors/ceilings, exact effort preservation, genuine decline detection, equipment boundaries, unit conversion, immutable history and backups. All 13 desktop/mobile browser flows passed; the three affected coaching flows were rerun after the final effort-preservation fix. The live web app’s new Settings and Method screens were inspected without changing the owner’s training data. The catalog and web/PWA build passed. Seven 0.4.0 desktop files built successfully for Windows, Linux, Apple Silicon Mac and Intel Mac. The Apple Silicon download checksum matched its GitHub asset digest; its 0.4.0 application opened successfully and displayed the new recovery controls. Other native runtimes were not exercised here.',
 '', verification,
 '',
 '## Methods and limits',
 '',
 'There are 240 distinct synthetic people across two seed families, each run through both controllers: 480 paired people-years. The 120 real-backend years repeat the first refined group for storage validation; they are not another independent human sample. Life events, schedules and attendance match exactly between controller versions. Latent adaptation/fatigue equations and coefficients were kept from the original simulator. Random streams were separated by life week, attendance, check-in and exercise/set to prevent altered prescriptions from changing later random events.',
 '',
 'The bodyweight simulation exposes its original 70%-of-mass mechanical assumption as a known synthetic measurement, with explicitly listed 1.25 kg added/assistance options. Both paired controllers receive that same setup. This is not a recommended coefficient in the app. Ordinary externally loaded exercises in the coarse cohort retain their 2.5 kg grid; calibrated bodyweight options are a separate setup, and do not demonstrate that coarse external equipment has been fixed. Initial bodyweight/assistance slots are excluded from the external-load-change summary so mode changes cannot divide by a zero starting load.',
 '',
 'The frozen baseline comes from commit 12c12b8, with imports relocated only. Production coaching was tested at b40d141; the 0.4.0 tag includes subsequent release-workflow changes. The full formulas, conservative thresholds and research limitations are in [the rationale](../../../docs/coaching-refinements.md). Reproduction is in [the audit README](../README.md).',
 '',
 'This establishes implementation behavior and some useful plausibility checks. It does not prove human hypertrophy, injury safety, optimal set targets or a fully autonomous coach. Real users must still report performance/recovery accurately and keep equipment/bodyweight setup current. Longitudinal human validation remains necessary.',
 '',
 '## Reviewable evidence',
 '',
 '- [Cohort comparison](cohort-comparison.csv)',
 '- [All paired account summaries](paired-accounts.csv)',
 '- [All detector controls](detector-controls.csv)',
 '- [Download the complete synthetic evidence bundle](https://github.com/JCarterJohnson/PANDR-5/releases/download/v0.4.0/PANDR-5-0.4.0-coaching-audit.zip): account backups, weekly/exercise series, response/noise controls, checksums and reproduction source. The same data is in the ignored results folder.',
 '',
 '## Research informing the policy',
 '',
 '- [Steele et al.: prediction error near failure](https://pmc.ncbi.nlm.nih.gov/articles/PMC5712461/) — supports treating effort/repetition estimates as imperfect; does not validate our thresholds.',
 '- [Suprak et al.: supported body mass in push-up positions](https://pubmed.ncbi.nlm.nih.gov/20179649/) — supports setup-specific resistance, not a universal bodyweight conversion.',
 '- [Bell et al.: deloading Delphi consensus](https://link.springer.com/article/10.1186/s40798-023-00633-0) — supports individualized stress reductions; exact prescriptions remain weakly evidenced.',
 '- [Coleman et al.: a week of complete training cessation](https://pubmed.ncbi.nlm.nih.gov/38274324/) — a different intervention from PANDR-5 half-volume pivots; it cannot validate or disprove this controller.',
]
(output/'REPORT.md').write_text('\n'.join(lines)+'\n')
# Standalone review page, with no remote scripts, fonts or tracking.
image=base64.b64encode((output/'comparison.png').read_bytes()).decode()
summary=f'Ordinary-noise false flags: {old_pct:.2f}% → {new_pct:.2f}%. Persistent sleep trouble improves modestly; physical equipment limits remain.'
def inline(text):
 return re.sub(r'\[([^\]]+)\]\(([^)]+)\)',r'<a href="\2">\1</a>',html.escape(text))
parts=[];in_list=False;in_table=False
for line in lines:
 if not line: continue
 if in_list and not line.startswith('- '): parts.append('</ul>');in_list=False
 if in_table and not line.startswith('|'): parts.append('</table>');in_table=False
 if line.startswith('# ') or line.startswith('!['): continue
 if line.startswith('## '): parts.append('<h2>'+inline(line[3:])+'</h2>')
 elif line.startswith('- '):
  if not in_list: parts.append('<ul>');in_list=True
  parts.append('<li>'+inline(line[2:])+'</li>')
 elif line.startswith('|'):
  if line.startswith('|---'): continue
  tag='td' if in_table else 'th'
  if not in_table: parts.append('<table>');in_table=True
  parts.append('<tr>'+''.join(f'<{tag}>'+inline(c.strip())+f'</{tag}>' for c in line.strip('|').split('|'))+'</tr>')
 else: parts.append('<p>'+inline(line)+'</p>')
if in_list: parts.append('</ul>')
if in_table: parts.append('</table>')
body=''.join(parts)
(output/'report.html').write_text(f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PANDR-5 coaching audit</title><style>body{{font:17px/1.6 system-ui;margin:0;color:#17233e;background:#f7f9fc}}main{{max-width:1120px;margin:auto;padding:40px 24px}}img{{width:100%;background:white;border-radius:12px}}p{{max-width:950px}}h1{{font-size:36px;line-height:1.2}}a{{color:#1769ef}}table{{border-collapse:collapse;font-size:15px}}td,th{{padding:10px;border-bottom:1px solid #dce2eb;text-align:left}}h2{{margin-top:36px}}</style><main><h1>PANDR-5 coaching refinement</h1><p>{summary}</p><img alt="Controlled comparison showing false flags, pivot weeks and normal volume" src="data:image/png;base64,{image}"><p><a href="REPORT.md">Full report</a> · <a href="paired-accounts.csv">Paired accounts</a> · <a href="detector-controls.csv">Detector controls</a></p>{body}</main></html>')
manifest={str(p.relative_to(results)):hashlib.sha256(p.read_bytes()).hexdigest() for p in results.rglob('*') if p.is_file() and p.suffix not in ['.log','.zip']}
(output/'evidence-checksums.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps({'backendVerified':bool(backend),'pairedPeopleYears':len(accounts),'ordinaryFalseFlagPct':new_pct,'higherNoiseFalseFlagPct':high_pct,'poorSleep':poor,'bodyweightModeTransitions':transitions},indent=2))
