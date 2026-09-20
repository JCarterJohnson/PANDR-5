"""Verify that real account synchronization did not change seeded training outcomes."""
import csv
import gzip
import json
from pathlib import Path

root = Path(__file__).parent.parent / 'coaching-refinements/results'
engine = json.loads((root / 'dry-run/summary.json').read_text())
backend = json.loads((root / 'verified/summary.json').read_text())
identity_fields = {'accountId', 'backupSha256', 'backupBytes', 'csvBytes'}
def outcomes(accounts):
    return {
        person['person']: {key: value for key, value in person.items() if key not in identity_fields}
        for person in accounts
    }
assert outcomes(engine['accounts']) == outcomes(backend['accounts']), 'Account outcomes changed during sync'

def normalized_rows(path):
    opener = gzip.open if path.suffix == '.gz' else open
    with opener(path, 'rt') as stream:
        rows = []
        for row in csv.DictReader(stream):
            normalized = {}
            for key, value in row.items():
                if value.lower() in ('true', 'false'):
                    normalized[key] = value.lower() == 'true'
                else:
                    try:
                        normalized[key] = float(value)
                    except ValueError:
                        normalized[key] = value
            rows.append(normalized)
    return sorted(rows, key=lambda row: (row['person'], row['week'], row.get('slot', '')))

counts = {}
for name in ('weekly.csv', 'lifts.csv.gz'):
    left = normalized_rows(root / 'dry-run' / name)
    right = normalized_rows(root / 'verified' / name)
    assert left == right, f'{name} changed during sync'
    counts[name] = len(left)
result = {'matchingAccounts': len(engine['accounts']), 'matchingRows': counts, 'runUrl': backend['runUrl']}
(root / 'verified/parity.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
