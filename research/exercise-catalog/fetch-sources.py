"""Refresh bibliographic identities via Europe PMC; no full-text papers are stored."""
import json, urllib.request, urllib.parse, pathlib, datetime, re, csv
ROOT=pathlib.Path(__file__).resolve().parents[2]
# ID, PMID, specific supported claim, limitation, evidence type.
SPECS=[
('volume','41343037','Direct versus indirect set accounting was compared in meta-regressions; half-credit indirect sets fit best.','Does not validate quarter credit or any exercise-specific coefficient.','meta-analysis'),
('emg','29354060','Surface EMG amplitude has important limitations as a proxy for force sharing and hypertrophy.','Not a conversion formula from activation to set credit.','methodological review'),
('press','29541130','Bench press and appropriately loaded push-ups increased pectoral and triceps thickness over eight weeks.','Small sample of young men; no exact synergist set equivalence.','longitudinal'),
('incline','32922646','Incline and horizontal bench pressing produced some regional differences in pectoral growth.','Supports distinguishing bench angles, not separate regional muscle IDs or exact fractions.','longitudinal'),
('squat','31230110','Squat depth affected gluteal/adductor growth; knee extensors grew but hamstrings did not significantly grow.','Study of barbell squats; leg press, hack squat and lunge application is an inference.','longitudinal'),
('hip-thrust','37877099','Squats and hip thrusts increased gluteal size; thigh growth favored squats; hamstrings and glute med/min changed little.','Untrained participants; not all machine designs or techniques.','longitudinal'),
('triceps','35819335','Overhead cable elbow extension produced greater triceps growth than neutral-arm extension.','Both train triceps; no numerical set multiplier is established.','longitudinal'),
('lateral','40692697','Dumbbell and cable lateral raises increased lateral deltoid thickness with similar observed changes.','Matched ROM; does not establish identical results for every cable height or machine.','longitudinal'),
('pull','26446291','Lat pulldowns and curls both increased elbow-flexor thickness in untrained men.','Conflicting comparative literature and muscle measurement limitations prevent exact fractions.','longitudinal'),
('elbow','7775488','Elbow and forearm positions alter elbow-flexor moment arms, including the biceps supination advantage.','Cadaver/model biomechanics; not hypertrophy or 0.25/0.5/1 calibration.','biomechanics'),
('neck','9189733','Specific head-extension training induced cervical hypertrophy beyond conventional resistance training.','Evidence for extension does not establish flexion/lateral-flexion effects or set equivalence.','longitudinal'),
('olympic','25689955','Weightlifting pulls and their derivatives use coordinated hip, knee and ankle extension; catches distinguish full lifts.','Power/technique review; hypertrophy-equivalent set accounting is especially uncertain.','professional review'),
('lumbar','24092889','Lumbar extensor adaptations depend on whether exercise loads spinal extension specifically or permits hip motion.','Review emphasizes specificity; exact hypertrophy set equivalents remain unknown.','review'),
('lumbar-counter','22387361','Lumbar extension strength increased with and without pelvic stabilization when training/testing used the same device.','Strength is not hypertrophy; counters a universal claim that restraint is always necessary.','longitudinal'),
('glute-review','40276368','Resistance training including hip thrusts, squats and some other hip extension exercises increases glute max size.','Heterogeneous protocols do not establish an allocation table for each variation.','systematic review'),
('adduction','24377067','Hip abduction/adduction with bands and machines can be performed with comparable perceived loading; EMG was measured.','Used for exercise identification and feasibility only, not precise credits or growth.','EMG / feasibility'),
('core-emg','32560185','Core exercise studies measure activity in rectus abdominis, obliques and spinal muscles.','EMG-only synthesis; cannot rank hypertrophy or assign exact set fractions.','EMG review'),
]
SPECS += [('calf','38156065','Standing calf raises grew gastrocnemius more than seated raises; soleus grew similarly in both positions.','Does not establish that standing soleus sets should count half; this remains source calibration.','longitudinal'), ('wrist','28759532','Direction-specific wrist resistance training improved wrist strength and motor control.','Strength outcomes do not establish hypertrophy equivalence or exact wrist exercise credits.','longitudinal')]
SPECS += [('ham-curl','33009197','Seated and prone leg curls increased hamstring size, with greater biarticular growth in the seated condition.','Does not establish exact per-set credit or equivalence across all leg curl devices.','longitudinal')]
SPECS += [('curl-position','40082069','Preacher and Bayesian cable curls with matched resistance profiles increased biceps and brachialis thickness without a significant between-condition difference.','Small ten-week trial in young men; does not establish a precise 1-to-0.5 allocation or universal superiority of either shoulder position.','longitudinal')]
out=[]
for ident,pmid,claim,limit,kind in SPECS:
    query=urllib.parse.urlencode({'query':f'EXT_ID:{pmid} AND SRC:MED','format':'json','resultType':'core'})
    with urllib.request.urlopen('https://www.ebi.ac.uk/europepmc/webservices/rest/search?'+query,timeout=30) as r: results=json.load(r)['resultList']['result']
    assert len(results)==1,(ident,results)
    r=results[0]
    out.append(dict(id=ident,title=re.sub('<[^>]*>', '', r['title']).rstrip('.'),authors=r.get('authorString',''),year=int(r['pubYear']),doi=r.get('doi'),url=f'https://pubmed.ncbi.nlm.nih.gov/{pmid}/',verificationUrl='https://www.ebi.ac.uk/europepmc/webservices/rest/search?'+query,claim=claim,limitations=limit,evidenceType=kind,verifiedOn='2026-09-18'))
    print(ident,r['title'])
for ident,section,claim in [
 ('anatomy-upper','11-5-muscles-of-the-pectoral-girdle-and-upper-limbs','Upper-limb and scapular muscles have different joint actions; wrist actions differ from elbow flexion.'),
 ('anatomy-lower','11-6-appendicular-muscles-of-the-pelvic-girdle-and-lower-limbs','Hip, knee and ankle muscles differ in their primary joint actions and biarticular geometry.'),
 ('anatomy-trunk','11-4-axial-muscles-of-the-abdominal-wall-and-thorax','Rectus abdominis flexes the trunk; obliques participate in rotation and lateral flexion.'),
 ('anatomy-neck','11-3-axial-muscles-of-the-head-neck-and-back','Neck flexion, extension and lateral flexion involve distinct muscles; spinal extensors extend the vertebral column.')]:
 out.append(dict(id=ident,title='Anatomy and Physiology: '+section[5:].replace('-',' ').title(),authors='OpenStax, Rice University',year=2013,doi=None,url='https://openstax.org/books/anatomy-and-physiology/pages/'+section,claim=claim,limitations='Anatomical actions support classification; all numerical set credits are editorial inference, not measured by this textbook.',evidenceType='anatomy textbook',verifiedOn='2026-09-18'))
out.append(dict(id='pandr-sheet',title='PANDR-5™ Model — Guide Sheet',authors='PANDR-5 model owner',year=2026,doi=None,url='https://docs.google.com/spreadsheets/d/1o7sQkxG_r72CH2Dv7CJDyqhSzbeBVhoKN6BVWNjcGjk/edit',claim='Guide Sheet J5:K23 encodes the preserved 26-exercise calibration catalog and 1/0.5/0.25 credits.',limitations='Owner model, not independent scientific validation; live formulas verified with Google Sheets connector on 2026-09-18.',evidenceType='model calibration',verifiedOn='2026-09-18'))
(ROOT/'src/data/catalog/sources.json').write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n')

with (ROOT/'research/exercise-catalog/sources.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=['id','title','authors','year','doi','url','claim','limitations','evidenceType','verifiedOn']);w.writeheader();w.writerows({k:v for k,v in row.items() if k!='verificationUrl'} for row in out)
