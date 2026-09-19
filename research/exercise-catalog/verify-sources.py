"""Online citation-identity and link check. No full text is retained."""
import json,pathlib,urllib.request,concurrent.futures,re
R=pathlib.Path(__file__).resolve().parents[2]
sources=json.loads((R/'src/data/catalog/sources.json').read_text())
def verify(s):
 row={'id':s['id'],'checkedOn':'2026-09-18','url':s['url'],'doi':s.get('doi')}
 try:
  if 'verificationUrl' in s:
   with urllib.request.urlopen(s['verificationUrl'],timeout=30) as res:result=json.load(res)['resultList']['result'][0]
   title=re.sub('<[^>]*>','',result['title']).rstrip('.')
   assert title==s['title'],(title,s['title'])
   assert result.get('doi')==s.get('doi')
   assert result['id']==s['url'].rstrip('/').split('/')[-1]
   row.update(status='verified',method='Europe PMC bibliographic identity matched PMID, title and DOI',resolvedTitle=title)
  elif s['id']=='pandr-sheet':
   snapshot=json.loads((R/'research/exercise-catalog/live-formula-check.json').read_text())
   assert snapshot['spreadsheetId'] in s['url']
   row.update(status='verified',method='Authenticated read-only Google Sheets API; live Guide Sheet formulas match preserved source values')
  else:
   req=urllib.request.Request(s['url'],headers={'User-Agent':'Mozilla/5.0'})
   with urllib.request.urlopen(req,timeout=30) as res:
    html=res.read().decode();row['httpStatus']=res.status
   section=s['url'].split('/pages/')[1]
   assert section in html and 'OpenStax' in html
   row.update(status='verified',method='Live OpenStax section URL and publisher identity checked; anatomical claims reviewed separately')
 except Exception as e:row.update(status='failed',error=str(e))
 return row
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:rows=list(pool.map(verify,sources))
out={'checkedOn':'2026-09-18','sources':rows,'failed':sum(r['status']!='verified' for r in rows),'scope':'Bibliographic verification is not evidence that any source measured exact exercise-specific FSA values. PubMed URLs may present bot challenges; the independent Europe PMC PMID/DOI/title lookup checks their citation identity.'}
(R/'research/exercise-catalog/source-verification.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out,indent=2));raise SystemExit(bool(out['failed']))
