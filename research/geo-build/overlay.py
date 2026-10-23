import json, math, re, sys
import numpy as np
from PIL import Image, ImageDraw
geo = json.load(open(sys.argv[1], encoding='utf-8'))
pr = geo['projection']; b = pr['bbox']; S = pr['units_per_degree_lat']; K = pr['cos_lat0']
W, H = int(geo['width']), int(round(geo['height']))
z = 12; LON0, LAT1 = 19.33, 41.07
def tx(lon): return (lon + 180) / 360 * 2 ** z
def ty(lat):
    r = np.radians(lat); return (1 - np.log(np.tan(r) + 1 / np.cos(r)) / np.pi) / 2 * 2 ** z
mos = np.asarray(Image.open('tiles/mosaic_12.png').convert('RGB'))
Y, X = np.mgrid[0:H, 0:W]
lat = b['lat_max'] - Y / S; lon = b['lon_min'] + X / (K * S)
mx = ((tx(lon) - tx(LON0)) * 256).astype(int); my = ((ty(lat) - ty(LAT1)) * 256).astype(int)
mx = np.clip(mx, 0, mos.shape[1] - 1); my = np.clip(my, 0, mos.shape[0] - 1)
img = Image.fromarray(mos[my, mx]).convert('RGB')
img = Image.blend(img, Image.new('RGB', img.size, 'white'), 0.25)
d = ImageDraw.Draw(img)
def subpaths(dstr):
    out = []
    for sp in re.findall(r'M[^M]+', dstr):
        nums = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', sp)]
        pts = list(zip(nums[0::2], nums[1::2]))
        if sp.strip().endswith('Z'): pts.append(pts[0])
        out.append(pts)
    return out
P = geo['paths']
for sp in subpaths(P['park']): d.line(sp, fill=(0, 110, 0), width=2)
for sp in subpaths(P['lagoon']): d.line(sp, fill=(220, 0, 200), width=2)
for lo in P['lagoons_other']:
    for sp in subpaths(lo['d']): d.line(sp, fill=(140, 0, 220), width=2)
for sp in subpaths(P['forest']): d.line(sp, fill=(0, 160, 60), width=1)
for r in P['roads']:
    for sp in subpaths(r['d']): d.line(sp, fill=(255, 120, 0), width=2)
for sp in subpaths(P['coast']): d.line(sp, fill=(255, 0, 0), width=2)
for p in geo['pois']:
    x, y = p['x'], p['y']; d.ellipse([x - 4, y - 4, x + 4, y + 4], outline=(0, 0, 0), fill=(255, 255, 0))
img.save(sys.argv[2])
# zoom crop around the visitor centre / beach cluster (2x)
crop = img.crop((440, 320, 680, 620)).resize((480, 600), Image.LANCZOS); crop.save(sys.argv[2].replace('.png', '_zoom.png'))
