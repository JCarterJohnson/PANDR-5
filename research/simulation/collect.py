"""Extract our synthetic-only evidence from a trusted GitHub Actions log archive."""
import base64
import csv
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import zipfile

root = Path(__file__).parent
destination = root.parent / 'coaching-refinements/results/verified'
destination.mkdir(parents=True, exist_ok=True)
bundles = {}
with zipfile.ZipFile(sys.argv[1]) as archive:
    for name in archive.namelist():
        if name.endswith('/'):
            continue
        text = archive.read(name).decode('utf-8', errors='replace')
        for shard in range(12):
            if not re.search(rf'PANDR_BUNDLE_BEGIN_{shard}\b', text) or shard in bundles:
                continue
            assert re.search(rf'PANDR_BUNDLE_END_{shard}\b', text), 'Incomplete evidence bundle'
            section = re.split(rf'PANDR_BUNDLE_BEGIN_{shard}\b', text, maxsplit=1)[1]
            section = re.split(rf'PANDR_BUNDLE_END_{shard}\b', section, maxsplit=1)[0]
            chunks = []
            for line in section.splitlines():
                # The first run's Vitest reporter occasionally split a worker's
                # stdout chunk. Recover pure-base64 continuation lines; gzip CRC
                # and each account's SHA-256 still verify the exact original bytes.
                # GitHub can prefix a newly concatenated log segment with a BOM.
                # Preserve physical order: runner timestamps can move backwards.
                line = re.sub(r'^\d{4}-\d{2}-\d{2}T\S+\s', '', line.lstrip('\ufeff'))
                prefixed = re.match(rf'PANDR_BUNDLE_{shard}:([A-Za-z0-9+/=]+)', line)
                if prefixed:
                    chunks.append(prefixed[1])
                elif re.fullmatch(r'[A-Za-z0-9+/=]{64,}', line):
                    chunks.append(line)
            assert chunks, f'No evidence chunks for shard {shard}'
            bundle = json.loads(gzip.decompress(base64.b64decode(''.join(chunks), validate=True)))
            assert bundle['report']['shard'] == shard
            bundles[shard] = bundle
assert len(bundles) == 12, f'Expected all twelve successful shards, received {list(bundles)}'
accounts, weekly, lifts, reports = [], [], [], []
for shard, bundle in sorted(bundles.items()):
    report = bundle['report']
    expected_people = set(range(shard, 120, 12))
    assert report['backend'] == 'real local Supabase on GitHub runner'
    assert report['shards'] == 12 and report['days'] == 365
    assert {a['person'] for a in report['accounts']} == expected_people
    assert len(report['accounts']) == len(expected_people) == report['database']['profiles']
    assert {int(person) for person in bundle['backups']} == expected_people
    assert len(bundle['weekly']) == len(expected_people) * 53
    assert {(row['person'], row['week']) for row in bundle['weekly']} == {
        (person, week) for person in expected_people for week in range(1, 54)
    }
    reports.append(bundle['report'])
    accounts.extend(bundle['report']['accounts'])
    weekly.extend(bundle['weekly'])
    lifts.extend(bundle['lifts'])
    for person, backup in bundle['backups'].items():
        raw = base64.b64decode(backup, validate=True)
        content = gzip.decompress(raw)
        record = next(a for a in bundle['report']['accounts'] if str(a['person']) == person)
        assert hashlib.sha256(content).hexdigest() == record['backupSha256']
        data = json.loads(content)
        assert len(data['sessions']) == record['trained']
        assert len(data['checkIns']) == record['checks']
        backup_dir = destination / 'accounts'
        backup_dir.mkdir(exist_ok=True)
        (backup_dir / f'person-{int(person):03d}.json.gz').write_bytes(raw)
accounts.sort(key=lambda a: a['person'])
assert len(accounts) == 120 and len({a['accountId'] for a in accounts}) == 120
assert {a['person'] for a in accounts} == set(range(120))
assert len({r['codeCommit'] for r in reports}) == 1
assert all(a['days'] == 365 for a in accounts)
assert sum(r['database']['profiles'] for r in reports) == 120
for label, rows, compressed in [('accounts', accounts, False), ('weekly', weekly, False), ('lifts', lifts, True)]:
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
    raw = stream.getvalue().encode()
    (destination / f'{label}.csv{ ".gz" if compressed else ""}').write_bytes(gzip.compress(raw) if compressed else raw)
summary = {'runUrl': f'https://github.com/JCarterJohnson/PANDR-5/actions/runs/{sys.argv[2]}', 'reports': reports, 'accounts': accounts}
(destination / 'summary.json').write_text(json.dumps(summary, indent=2))
print(json.dumps({'accounts': len(accounts), 'sessions': sum(a['trained'] for a in accounts), 'checkIns': sum(a['checks'] for a in accounts), 'weeklyRows': len(weekly), 'liftRows': len(lifts), 'directory': str(destination)}, indent=2))
