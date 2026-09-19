"""Offline reproducible structural/dedup/evidence audit, exits nonzero on defects."""
import json,pathlib,re,difflib,hashlib,csv
R=pathlib.Path(__file__).resolve().parents[2]; D=R/'src/data/catalog'; notes=R/'research/exercise-catalog'
es=json.loads((D/'master-catalog.json').read_text(encoding='utf-8'));ms=json.loads((D/'metadata.json').read_text(encoding='utf-8'));ss=json.loads((D/'sources.json').read_text(encoding='utf-8'));old=json.loads((R/'tests/fixtures/legacy-catalog.json').read_text(encoding='utf-8'))['exercises']
errors=[]
def check(ok,message):
 if not ok:errors.append(message)
check(set(es)=={'schemaVersion','exercises'} and es['schemaVersion']==1,'Import envelope incompatible')
es=es['exercises']; ids={e['id'] for e in es};sids={s['id'] for s in ss}
check(len(ids)==len(es),'Duplicate IDs');check(ids==set(ms),'Metadata membership mismatch');check(len(sids)==len(ss),'Duplicate source IDs')
known={m['id'] for m in json.loads((R/'tests/fixtures/legacy-muscles.json').read_text(encoding='utf-8'))}|{'abdominals','obliques','neck','wrist-flexors','wrist-extensors'}
names={}; count=0
for e in es:
 ident=e['id'];m=ms[ident];cs=e['contributions']
 check(set(e)=={'id','name','equipment','source','contributions','beyondFailureAllowed'},f'{ident}: incompatible saved schema')
 check(len({c['muscle'] for c in cs})==len(cs),f'{ident}: duplicate credited muscle')
 check(m['primaryMuscle'] in {c['muscle'] for c in cs},f'{ident}: missing primary')
 check(all(c['muscle'] in known and c['coefficient'] in [1,.5,.25] for c in cs),f'{ident}: unknown muscle/credit')
 check(all(s in sids for s in m['sourceIds']),f'{ident}: missing citation')
 check(bool(m['sourceIds']),f'{ident}: empty sources')
 for key in ['setup','rationale','confidence','limitations','category','laterality','loading']:check(bool(m[key]),f'{ident}: missing {key}')
 check(m['confidence'] in ['high','medium','low'],f'{ident}: confidence invalid')
 if not ident.startswith('source-'):
  check(any(c['coefficient']==1 for c in cs),f'{ident}: no full primary')
  check(len(cs)<=4 and sum(c['coefficient'] for c in cs)<=2.5,f'{ident}: excessive credits require explicit review')
 for name in [e['name']]+m['aliases']:
  normalized=re.sub('[^a-z0-9]','',name.lower())
  check(names.get(normalized,ident)==ident,f'{ident}: alias/name collision {name}')
  names[normalized]=ident
 for c in m['allocationEvidence']:
  check(c['confidence'] in ['high','medium','low'],f'{ident}: invalid allocation confidence')
for e in old:check(next((v for v in es if v['id']==e['id']),None)==e,f"Changed legacy record {e['id']}")
reviews=json.loads((notes/'near-duplicate-review.json').read_text(encoding='utf-8'));review={frozenset([a,b]):reason for a,b,reason in reviews}
near=[]
for i,a in enumerate(es):
 for b in es[i+1:]:
  score=difflib.SequenceMatcher(None,a['name'].lower(),b['name'].lower()).ratio()
  if score>=.88:
   key=frozenset([a['id'],b['id']]);near.append({'a':a['id'],'b':b['id'],'similarity':round(score,4),'decision':review.get(key)})
   check(key in review,f'Unreviewed near duplicate: {a["id"]} / {b["id"]}')
for s in ss:
 for field in ['title','authors','year','url','claim','limitations','evidenceType','verifiedOn']:check(bool(s.get(field)),f'{s["id"]}: missing {field}')
 check(s['url'].startswith('https://'),f'{s["id"]}: invalid URL')
 if s.get('doi'):check(bool(re.match(r'^10\.\d{4,9}/\S+$',s['doi'])),f'{s["id"]}: DOI format')
with (notes/'catalog.csv').open(encoding='utf-8',newline='') as f: check(len(list(csv.DictReader(f)))==len(es),'CSV row count differs')
report=dict(status='passed' if not errors else 'failed',canonicalExercises=len(es),aliases=sum(len(m['aliases']) for m in ms.values()),sources=len(ss),legacyRecordsPreserved=len(old),nearDuplicatePairs=near,errors=errors,catalogSha256=hashlib.sha256((D/'master-catalog.json').read_bytes()).hexdigest(),citationVerification='Bibliographic IDs independently resolved by fetch-sources.py; live link audit recorded separately in source-verification.json. Offline audit checks referential integrity, not network availability.')
(notes/'validation-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='nearDuplicatePairs'},indent=2));raise SystemExit(bool(errors))
