"""Export synthetic evidence after the test reporter has fully exited."""
import base64
import gzip
import json
from pathlib import Path
import sys

source = Path(sys.argv[1])
raw = source.read_bytes()
data = json.loads(gzip.decompress(raw))
shard = data['report']['shard']
assert data['report']['backend'] == 'real local Supabase on GitHub runner'
assert 0 <= shard < 12
encoded = base64.b64encode(raw).decode('ascii')
print(f'PANDR_BUNDLE_BEGIN_{shard}')
for start in range(0, len(encoded), 8000):
    print(f'PANDR_BUNDLE_{shard}:{encoded[start:start + 8000]}')
print(f'PANDR_BUNDLE_END_{shard}')
