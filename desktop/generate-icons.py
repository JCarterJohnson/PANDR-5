"""Generate the geometric P5 icon without font or image dependencies."""
import pathlib
import struct
import subprocess
import zlib

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'icons'
BACKGROUND = (8, 101, 245)
WHITE = (255, 255, 255)
LIME = (255, 255, 255)
P = [(132, 154), (218, 154), (247, 183), (247, 260), (218, 289), (173, 289), (173, 357), (132, 357)]
FIVE = [(282, 154), (389, 154), (389, 194), (323, 194), (323, 233), (366, 233), (392, 259), (392, 329), (364, 357), (277, 357), (277, 317), (350, 317), (351, 316), (351, 273), (282, 273)]

def polygon(x, y, vertices):
    inside = False
    j = len(vertices) - 1
    for i, (xi, yi) in enumerate(vertices):
        xj, yj = vertices[j]
        if ((yi > y) != (yj > y)) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside

def pixel(x, y, maskable):
    if not maskable:
        cx, cy = min(max(x, 112), 400), min(max(y, 112), 400)
        if (x-cx)**2 + (y-cy)**2 > 112**2:
            return (0, 0, 0, 0)
    color = BACKGROUND
    if polygon(x, y, P) and not (173 <= x <= 207 and 194 <= y <= 249):
        color = WHITE
    if polygon(x, y, FIVE):
        color = LIME
    if 394.5 <= y <= 401.5:
        for left in [199, 231, 263, 295, 327]:
            px = min(max(x, left), left+12)
            if (x-px)**2 + (y-398)**2 <= 3.5**2:
                color = LIME
    return (*color, 255)

def chunk(name, data):
    return struct.pack('>I', len(data)) + name + data + struct.pack('>I', zlib.crc32(name+data))

def render(size, target, maskable=False):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            rows.extend(pixel((x+.5)*512/size, (y+.5)*512/size, maskable))
    data = b'\x89PNG\r\n\x1a\n'
    data += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')
    target.write_bytes(data)

ROOT.mkdir(parents=True, exist_ok=True)
render(1024, ROOT / 'icon-1024.png')
render(512, ROOT / 'icon-maskable-512.png', True)
for size, name in [(192, 'icon-192.png'), (512, 'icon-512.png'), (180, 'apple-touch-icon.png')]:
    if subprocess.run(['which', 'sips'], capture_output=True).returncode == 0:
        subprocess.run(['sips', '-z', str(size), str(size), str(ROOT/'icon-1024.png'), '--out', str(ROOT/name)], check=True, stdout=subprocess.DEVNULL)
    else:
        render(size, ROOT/name)
print(f'Generated P5 app icons in {ROOT}')
