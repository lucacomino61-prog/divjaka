"""Build geo.json + lagoon-map.svg for the Divjaka site from cached Overpass/OSM-API JSON.

Run:  python -I build.py <scratch_osm_dir> <research_out_dir>
"""
import json, math, sys, os, datetime
sys.stdout.reconfigure(encoding='utf-8')

OSM = sys.argv[1]
OUT = sys.argv[2]

def load(n):
    return json.load(open(os.path.join(OSM, n), encoding='utf-8'))

q2, q3, q4, q5, q6, q7, q8, q9 = [load(f'q{i}.json') for i in (2, 3, 4, 5, 6, 7, 8, 9)]
api = load('api_elements.json')

# ---------------------------------------------------------------- projection
LON_MIN, LON_MAX = 19.345, 19.600
LAT_MIN, LAT_MAX = 40.800, 41.062
LAT0 = (LAT_MIN + LAT_MAX) / 2
K = math.cos(math.radians(LAT0))
W = 1000.0
S = W / ((LON_MAX - LON_MIN) * K)          # SVG units per degree of latitude
H = round((LAT_MAX - LAT_MIN) * S, 1)
KM_PER_DEG = math.pi * 6371.0088 / 180     # spherical mean Earth radius
KM_PER_UNIT = KM_PER_DEG / S

def proj(lat, lon):
    return ((lon - LON_MIN) * K * S, (LAT_MAX - lat) * S)

def unproj(x, y):
    return (LAT_MAX - y / S, LON_MIN + x / (K * S))

def g2xy(geom):
    return [proj(p['lat'], p['lon']) for p in geom]

# ---------------------------------------------------------------- helpers
def perp(p, a, b):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)
    t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)
    t = max(0, min(1, t))
    return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))

def dp(pts, eps):
    """Douglas-Peucker on an open polyline (endpoints kept)."""
    n = len(pts)
    if n < 3:
        return list(pts)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        dmax, idx = 0, -1
        for k in range(i + 1, j):
            d = perp(pts[k], pts[i], pts[j])
            if d > dmax:
                dmax, idx = d, k
        if dmax > eps and idx > 0:
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    return [p for p, k in zip(pts, keep) if k]

def dp_ring(ring, eps):
    """DP on a closed ring: split at the vertex farthest from vertex 0."""
    r = ring[:-1] if ring[0] == ring[-1] else ring[:]
    if len(r) < 4:
        return r + [r[0]]
    far = max(range(len(r)), key=lambda i: math.hypot(r[i][0] - r[0][0], r[i][1] - r[0][1]))
    a = dp(r[:far + 1], eps)
    b = dp(r[far:] + [r[0]], eps)
    out = a[:-1] + b
    return out

def area(ring):
    s = 0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        s += x1 * y2 - x2 * y1
    return s / 2

def centroid(ring):
    xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
    return sum(xs) / len(xs), sum(ys) / len(ys)

def pip(pt, ring):
    x, y = pt; inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y):
            xi = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if xi > x:
                inside = not inside
    return inside

def fmt(v):
    s = f'{v:.1f}'
    if s.endswith('.0'):
        s = s[:-2]
    if s == '-0':
        s = '0'
    return s

def dedupe(pts):
    out = []
    for p in pts:
        q = (round(p[0], 1), round(p[1], 1))
        if not out or out[-1] != q:
            out.append(q)
    return out

def path(pts, closed=False):
    pts = dedupe(pts)
    if closed and len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    d = 'M' + fmt(pts[0][0]) + ' ' + fmt(pts[0][1])
    for x, y in pts[1:]:
        d += 'L' + fmt(x) + ' ' + fmt(y)
    if closed:
        d += 'Z'
    return d, len(pts)

def clip_polyline(pts, xmin=0, ymin=0, xmax=W, ymax=H):
    """Liang-Barsky per segment; returns list of polylines inside the box."""
    pieces, cur = [], []
    for a, b in zip(pts, pts[1:]):
        x0, y0 = a; x1, y1 = b
        dx, dy = x1 - x0, y1 - y0
        t0, t1, ok = 0.0, 1.0, True
        for p, q in ((-dx, x0 - xmin), (dx, xmax - x0), (-dy, y0 - ymin), (dy, ymax - y0)):
            if p == 0:
                if q < 0:
                    ok = False; break
            else:
                t = q / p
                if p < 0:
                    if t > t1: ok = False; break
                    t0 = max(t0, t)
                else:
                    if t < t0: ok = False; break
                    t1 = min(t1, t)
        if not ok:
            if cur: pieces.append(cur); cur = []
            continue
        A = (x0 + t0 * dx, y0 + t0 * dy); B = (x0 + t1 * dx, y0 + t1 * dy)
        if not cur:
            cur = [A, B]
        else:
            if cur[-1] != A:
                pieces.append(cur); cur = [A, B]
            else:
                cur.append(B)
        if t1 < 1.0:
            pieces.append(cur); cur = []
    if cur: pieces.append(cur)
    return [p for p in pieces if len(p) > 1]

def clip_ring(ring, xmin=0.0, ymin=0.0, xmax=W, ymax=H):
    """Sutherland-Hodgman clip of a closed ring to the viewBox."""
    pts = ring[:-1] if ring[0] == ring[-1] else list(ring)
    def clip(pts, inside, inter):
        out = []
        for i, cur in enumerate(pts):
            prev = pts[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(inter(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(inter(prev, cur))
        return out
    def ix(a, b, x):
        t = (x - a[0]) / (b[0] - a[0]); return (x, a[1] + t * (b[1] - a[1]))
    def iy(a, b, y):
        t = (y - a[1]) / (b[1] - a[1]); return (a[0] + t * (b[0] - a[0]), y)
    for inside, inter in ((lambda p: p[0] >= xmin, lambda a, b: ix(a, b, xmin)),
                          (lambda p: p[0] <= xmax, lambda a, b: ix(a, b, xmax)),
                          (lambda p: p[1] >= ymin, lambda a, b: iy(a, b, ymin)),
                          (lambda p: p[1] <= ymax, lambda a, b: iy(a, b, ymax))):
        if not pts:
            break
        pts = clip(pts, inside, inter)
    return pts + pts[:1] if pts else []

def eps_for_target(simplify, target, lo=0.01, hi=20.0):
    """Smallest eps (finest detail) whose point count <= target."""
    for _ in range(40):
        mid = (lo + hi) / 2
        if simplify(mid) <= target:
            hi = mid
        else:
            lo = mid
    return hi

def chain_ways(ways):
    """Join OSM ways (with 'nodes' + 'geometry') into chains by shared end nodes."""
    segs = [(list(w['nodes']), list(w['geometry'])) for w in ways if w['nodes'][0] != w['nodes'][-1]]
    chains = []
    while segs:
        n, g = segs.pop(0)
        changed = True
        while changed:
            changed = False
            for i, (n2, g2) in enumerate(segs):
                if n2[0] == n[-1]:
                    n += n2[1:]; g += g2[1:]
                elif n2[-1] == n[-1]:
                    n += n2[::-1][1:]; g += g2[::-1][1:]
                elif n2[-1] == n[0]:
                    n = n2[:-1] + n; g = g2[:-1] + g
                elif n2[0] == n[0]:
                    n = n2[::-1][:-1] + n; g = g2[::-1][:-1] + g
                else:
                    continue
                segs.pop(i); changed = True; break
        chains.append((n, g))
    return chains

def by_id(data, typ, i):
    for e in data['elements']:
        if e['type'] == typ and e['id'] == i:
            return e
    raise KeyError((typ, i))

report = {}

# ---------------------------------------------------------------- park
park_way = by_id(q2, 'way', 503885261)
park_xy = g2xy(park_way['geometry'])
park_s = dp_ring(park_xy, 0.4)
park_d, n_park = path(park_s, True)
report['park_points'] = (len(park_xy), n_park)

# ---------------------------------------------------------------- lagoon (relation 10092047)
lag = by_id(q2, 'relation', 10092047)
outer = [g2xy(m['geometry']) for m in lag['members'] if m['role'] == 'outer']
inner = [(m['ref'], g2xy(m['geometry'])) for m in lag['members'] if m['role'] == 'inner']

def lagoon_build(eps):
    rings = [dp_ring(r, eps) for r in outer]
    isl = []
    for ref, r in inner:
        s = dp_ring(r, max(eps * 0.6, 0.15))
        if abs(area(s[:-1])) >= 1.5 and len(s) >= 4:   # >= ~1.5 unit^2 (~700 m^2); smaller ones vanish at this scale
            isl.append((ref, s))
    return rings, isl

def lagoon_count(eps):
    rings, isl = lagoon_build(eps)
    return sum(len(r) - 1 for r in rings) + sum(len(r) - 1 for _, r in isl)

eps_lag = eps_for_target(lagoon_count, 760)
rings, isl = lagoon_build(eps_lag)
lagoon_parts = [path(r, True) for r in rings] + [path(r, True) for _, r in isl]
lagoon_d = ''.join(p[0] for p in lagoon_parts)
lagoon_outline_d = lagoon_parts[0][0]
n_lag = sum(p[1] for p in lagoon_parts)
report['lagoon'] = dict(eps=round(eps_lag, 3), raw=sum(len(r) for r in outer) + sum(len(r) for _, r in inner),
                        out=n_lag, outer_ring=lagoon_parts[0][1], islets_kept=[ref for ref, _ in isl],
                        islets_dropped=[ref for ref, _ in inner if ref not in [i for i, _ in isl]])

# ---------------------------------------------------------------- other lagoons / lakes
others_spec = [
    ('way', 295004597, 'Laguna e Godullës', 'Godulla Lagoon', 'lagoon'),
    ('relation', 3688163, None, None, 'lake'),
    ('way', 282034024, None, None, 'lake'),
    ('way', 282034026, None, None, 'lake'),
    ('way', 282034031, None, None, 'lake'),
    ('way', 534521503, 'Liqeni i Godullës së Veçmës', None, 'lake'),
    ('way', 534521504, 'Liqeni i Petritit', None, 'lake'),
    ('way', 1124719283, None, None, None),
]
lagoons_other = []
for typ, i, nsq, nen, wtag in others_spec:
    e = by_id(q2, typ, i)
    if typ == 'relation':
        rs = [(m['role'], g2xy(m['geometry'])) for m in e['members']]
    else:
        rs = [('outer', g2xy(e['geometry']))]
    ds, cnt = '', 0
    for role, r in rs:
        s = clip_ring(dp_ring(r, 0.35))
        if len(s) < 4 or (role == 'inner' and abs(area(s[:-1])) < 1.5):
            continue
        d, c = path(s, True); ds += d; cnt += c
    outer_r = [r for role, r in rs if role == 'outer'][0]
    c = centroid(outer_r)
    lat, lon = unproj(*c)
    lagoons_other.append({
        'id': f'osm-{typ}-{i}',
        'name_sq': nsq, 'name_en': nen,
        'osm_tags': {'natural': 'water', 'water': wtag} if wtag else {'natural': 'water'},
        'osm_url': f'https://www.openstreetmap.org/{typ}/{i}',
        'in_park': pip(c, park_xy),
        'area_km2': round(abs(area(outer_r[:-1])) * KM_PER_UNIT ** 2, 3),
        'centroid_latlon': [round(lat, 5), round(lon, 5)],
        'points': cnt,
        'd': ds,
    })

# ---------------------------------------------------------------- coastline
coast_ways = [e for e in q3['elements'] if e.get('tags', {}).get('boundary') == 'administrative' or e['id'] in
              (27942239, 244982752, 357831242, 358926836, 1325575530, 1325575531, 1325575532, 1325575533, 1325575534, 1325575535)]
coast_ways = [e for e in coast_ways if e['nodes'][0] != e['nodes'][-1]]
chains = chain_ways(coast_ways)
assert len(chains) == 1, [len(c[0]) for c in chains]
cn, cg = chains[0]
# orient north -> south (as OSM draws it, land on the left)
if cg[0]['lat'] < cg[-1]['lat']:
    cn, cg = cn[::-1], cg[::-1]
SEMAN_NODE, SHKUMBIN_NODE = 5183604549, 2822287063
iN = cn.index(SHKUMBIN_NODE)
iS = cn.index(SEMAN_NODE)
assert iN < iS
seman_mouth = (cg[iS]['lat'], cg[iS]['lon'])
shkumbin_mouth = (cg[iN]['lat'], cg[iN]['lon'])
cxy = g2xy(cg)

def coast_simplify(eps):
    a = dp(cxy[:iN + 1], eps)
    b = dp(cxy[iN:iS + 1], eps)
    c = dp(cxy[iS:], eps)
    return a, b, c

eps_coast = eps_for_target(lambda e: len(dedupe(coast_simplify(e)[1])), 580)
ca, cb, cc = coast_simplify(eps_coast)
coast_seg = cb[::-1]                       # Seman mouth (south) -> Shkumbin mouth (north)
coast_d, n_coast = path(coast_seg)
full_coast = ca[:-1] + cb[:-1] + cc        # north -> south, simplified with the same eps
full_clip = clip_polyline(full_coast)
assert len(full_clip) == 1, len(full_clip)
fc = full_clip[0]
assert abs(fc[0][1]) < 1e-6 and abs(fc[-1][1] - H) < 1e-6, (fc[0], fc[-1])   # enters top, leaves bottom
coast_full_d, n_coast_full = path(fc)
report['coast'] = dict(eps=round(eps_coast, 3), raw=iS - iN + 1, out=n_coast, full_clipped=n_coast_full)

# coastal islands (natural=coastline closed ways)
islands = []
for i in (1203806603, 1354891926):
    e = by_id(q3, 'way', i)
    s = dp_ring(g2xy(e['geometry']), 0.35)
    d, c = path(s, True)
    islands.append({'id': f'osm-way-{i}', 'osm_url': f'https://www.openstreetmap.org/way/{i}',
                    'osm_tags': e.get('tags', {}), 'd': d})

# sea polygon: clipped full coastline + west edge (evenodd with islands as holes)
sea_pts = fc + [(0.0, H), (0.0, 0.0)]
sea_d = path(sea_pts, True)[0] + ''.join(i['d'] for i in islands)

# ---------------------------------------------------------------- forest
forest_way = by_id(q5, 'way', 295114375)
fxy = g2xy(forest_way['geometry'])
eps_forest = eps_for_target(lambda e: len(dp_ring(fxy, e)) - 1, 420)
forest_d, n_forest = path(dp_ring(fxy, eps_forest), True)
report['forest'] = dict(eps=round(eps_forest, 3), raw=len(fxy), out=n_forest)
forest_other = []
for i in (295114437, 611733528, 1074182709):
    e = by_id(q5, 'way', i)
    d, c = path(clip_ring(dp_ring(g2xy(e['geometry']), 0.5)), True)
    forest_other.append({'id': f'osm-way-{i}', 'osm_url': f'https://www.openstreetmap.org/way/{i}',
                         'osm_tags': e.get('tags', {}), 'd': d})

# ---------------------------------------------------------------- roads into Divjakë
def ways_from(data, ids):
    return [by_id(data, 'way', i) for i in ids]

road_defs = [
    ('road-beach', 'Divjakë – Qendra e Vizitorëve – plazhi', 'Divjakë – Visitor Centre – beach', None,
     'unclassified', q9, [444020547, 302285080, 302285077, 217295951, 234350436, 234350441]),
    ('road-sh57-north', 'SH57 drejt veriut / verilindjes', 'SH57 north / north-east', 'SH57',
     'secondary', q6, [768892722, 1008754595, 1008754596, 1008754600, 217293468, 217293367, 229381393]),
    ('road-south', 'Divjakë – Babunjë (jug, buzë lagunës)', 'Divjakë – Babunjë (south, along the lagoon)', None,
     'secondary', q6, [768892728, 253300139]),
    ('road-east', 'Divjakë – Tre Urat (lindje)', 'Divjakë – Tre Urat (east)', None,
     'tertiary', q6, [444020552, 291725627, 291732732, 291732729, 655483923]),
]
roads = []
for rid, lsq, len_, ref, hw, data, ids in road_defs:
    ws = ways_from(data, ids)
    ch = chain_ways(ws)
    ds, cnt = '', 0
    for n, g in ch:
        for piece in clip_polyline(g2xy(g)):
            d, c = path(dp(piece, 0.4)); ds += d; cnt += c
    roads.append({'id': rid, 'label_sq': lsq, 'label_en': len_, 'ref': ref, 'highway': hw,
                  'label_note': 'descriptive label (start/end places from OSM), not an official road name',
                  'osm_ways': ids, 'chains': len(ch), 'points': cnt, 'd': ds})

# ---------------------------------------------------------------- rivers (lower reaches, context)
rivers = []
for rid, sq, en, ids in (('river-seman', 'Lumi i Semanit', 'Seman River', [192565835, 1005011486]),
                         ('river-shkumbin', 'Shkumbini', 'Shkumbin River', [386566807])):
    ws = ways_from(q4, ids)
    ch = chain_ways(ws)
    ds, cnt = '', 0
    for n, g in ch:
        for piece in clip_polyline(g2xy(g)):
            d, c = path(dp(piece, 0.5)); ds += d; cnt += c
    rivers.append({'id': rid, 'name_sq': sq, 'name_en': en, 'osm_ways': ids, 'points': cnt, 'd': ds})

# ---------------------------------------------------------------- boardwalks / bridges / pier (line geometry)
bw = []
for i, kind in ((1089837162, 'boardwalk'), (1388562406, 'footbridge'), (1170877709, 'footbridge'), (559801618, 'pier')):
    e = None
    for data in (q8, q7):
        try:
            e = by_id(data, 'way', i); break
        except KeyError:
            pass
    if e is None or 'geometry' not in e:
        continue
    d, c = path(g2xy(e['geometry']))
    bw.append({'id': f'osm-way-{i}', 'kind': kind, 'osm_url': f'https://www.openstreetmap.org/way/{i}', 'd': d})

# ---------------------------------------------------------------- POIs
def osm_ll(key):
    el = api[key]
    return el.get('lat'), el.get('lon')

def center_of(typ, i):
    for data in (q7, q8, q2):
        for e in data['elements']:
            if e['type'] == typ and e['id'] == i:
                if 'center' in e:
                    return e['center']['lat'], e['center']['lon']
                if 'geometry' in e:
                    g = e['geometry']; return sum(p['lat'] for p in g) / len(g), sum(p['lon'] for p in g) / len(g)
    raise KeyError((typ, i))

def ow(typ, i):
    return f'https://www.openstreetmap.org/{typ}/{i}'

pois = []
def poi(pid, kind, nsq, nen, lat, lon, source, confidence, osm_url=None, sources=None, notes=None, conflicts=None):
    x, y = proj(lat, lon)
    pois.append({
        'id': pid, 'kind': kind, 'name_sq': nsq, 'name_en': nen,
        'lat': round(lat, 6), 'lon': round(lon, 6),
        'x': round(x, 1), 'y': round(y, 1),
        'in_view': 0 <= x <= W and 0 <= y <= H,
        'in_park': pip((x, y), park_xy),   # against the raw OSM boundary (way 503885261), not the simplified path
        'osm_url': osm_url,
        'osm_map_url': f'https://www.openstreetmap.org/?mlat={lat:.6f}&mlon={lon:.6f}#map=17/{lat:.5f}/{lon:.5f}',
        'gmaps_url': f'https://www.google.com/maps/search/?api=1&query={lat:.6f}%2C{lon:.6f}',
        'source': source, 'sources': sources or [source],
        'confidence': confidence, 'notes': notes, 'conflicts': conflicts,
    })

lat, lon = osm_ll('node/11021725056')
poi('hotel-pelikan', 'hotel', 'Hotel Pelikan', 'Hotel Pelikan', lat, lon, ow('node', 11021725056), 'high', ow('node', 11021725056),
    [ow('node', 11021725056), ow('way', 573637932), 'research/business.json -> contact.coordinates (Booking.com 40.972262, 19.479574; Google Maps pin 40.9722664, 19.4799887)'],
    'OSM node tourism=hotel; OSM building way 573637932 "Hotel & Restaurant Pelikan" next to it; Booking and Google pins (business agent) agree within ~30 m. At the end of the beach road, beside Divjaka beach.')

lat, lon = osm_ll('node/8837784839')
poi('visitor-centre', 'visitor_centre', 'Qendra e Vizitorëve Divjakë-Karavasta', 'Divjakë-Karavasta Visitor Centre', lat, lon,
    ow('node', 8837784839), 'high', ow('node', 8837784839),
    [ow('node', 8837784839), ow('way', 292705751), 'research/heritage.json visit-01',
     'https://www.google.com/maps/search/Divjak%C3%AB-Karavasta+National+Park+Visitor+Centre/@40.98,19.48,14z (Google Maps "Visitor Center Divjaka", plus code 8FGXXFQM+VR4 = 40.98964, 19.48458; opened 2026-10-23)'],
    'OSM: tourism=information + information=office "NP Divjake-Karavasta Visitors Centre" (source=survey); building way 292705751 amenity=ranger_station, check_date 2025-09-11. '
    'Verifier 2026-10-23: the Google Maps listing "Visitor Center Divjaka" (plus code XFQM+VR4) decodes to 18 m from this point, and "National Park Divjakë - Karavasta Office" (XFQM+WVJ) to 6 m, so two independent sources agree.')

lat, lon = osm_ll('node/11379665876')
poi('pelican-tower', 'observation_tower', 'Kulla e Vëzhgimit të Pelikanëve', 'Pelican Observation Tower', lat, lon,
    ow('node', 11379665876), 'low', ow('node', 11379665876),
    [ow('node', 11379665876), ow('node', 8738280465), 'research/heritage.json visit-03 (AOS: Pelican Trail ends at the observation tower of the pelican colony)'],
    'OSM node tourism=viewpoint name:en "Bird watching tower" (2023), on the lagoon barrier facing the lagoon at the end of the track south of the beach. '
    'Verifier 2026-10-23: on Esri World Imagery (z18) the point sits on a small vegetated bar at the mouth of the canal at the end of that track; '
    'OSM maps the bar as lagoon water, so the pin falls about 160 m inside the drawn lagoon shore. A Google Maps "observation tower" search around this point '
    '(https://www.google.com/maps/search/observation+tower/@40.950357,19.480795,15z) lists only Kulla 360° and no separate tower here.',
    'Same spot: OSM node 8738280465 leisure=bird_hide is tagged note=destroyed, opening_hours="Mo-Su off", check_date 2025-09-24, source=survey. Which tower the client means by "Kulla e Vëzhgimit të Pelikanëve" (this one or the 35/36 m "Kulla 360°" at the visitor centre) is unconfirmed - ask the client; check on site whether the tower still stands.')

lat, lon = center_of('way', 1124509421)
poi('tower-360', 'observation_tower', 'Kulla 360°', '360° Tower', lat, lon, ow('way', 1124509421), 'high', ow('way', 1124509421),
    [ow('way', 1124509421), 'research/heritage.json visit-02 (AKT: 36 m panoramic tower)',
     'https://www.google.com/maps/search/Kulla+360+Divjak%C3%AB/@40.98,19.48,14z (Google Maps place "Kulla 360°", 40.990179, 19.4847204; opened 2026-10-23)'],
    'OSM: man_made=tower, tower:type=observation, wood, fee=yes, beside the visitor centre. Coordinate = centre of the OSM building outline. '
    'Verifier 2026-10-23: the Google Maps place "Kulla 360°" is about 7 m from this point.',
    'Height: OSM height=35 vs AKT text "36 m".')

lat, lon = osm_ll('node/728427729')
poi('divjake-centre', 'town', 'Divjakë (qendra)', 'Divjakë (town centre)', lat, lon, ow('node', 728427729), 'high', ow('node', 728427729),
    [ow('node', 728427729), 'https://www.wikidata.org/wiki/Q1945622 (P625 40.9964, 19.5327)'],
    'OSM place=town node; Wikidata coordinate is ~90 m away. Town hall (OSM relation 18096103 "Bashkia Divjakë") is ~300 m south-west.')

lat, lon = osm_ll('node/7875214285')
poi('divjaka-beach', 'beach', 'Plazhi i Divjakës', 'Divjaka beach', lat, lon, ow('node', 7875214285), 'medium', ow('node', 7875214285),
    [ow('node', 7875214285), ow('way', 234350457)],
    'OSM node tourism=attraction name="Divjaka beach" at the end of the beach road. The sandy beach itself (OSM way 234350457 natural=beach, unnamed) runs for kilometres along the coast; the pin marks the resort access point.')

# Verifier fix 2026-10-23: OSM has the two Karavasta villages' names swapped relative to every other source opened.
# Karavasta (Fshat) is the EASTERN settlement; the western one (OSM node 728424535, named "Karavasta" in OSM) is Karavasta e Re.
lat, lon = osm_ll('node/728425225')
poi('karavasta-village', 'village', 'Karavasta', 'Karavasta (village)', lat, lon,
    'https://www.google.com/maps/@40.8775,19.4830,15z', 'medium', ow('node', 728425225),
    ['https://www.google.com/maps/@40.8775,19.4830,15z (Google Maps labels "Karavasta Fshat" here and "Karavasta e Re" ~1 km west; Google place "Karavasta e Re" = 40.878651, 19.4757378; opened 2026-10-23)',
     'https://www.geonames.org/search.html?q=Karavasta&country=AL (GeoNames "Karavasta", populated place, 40°52′39″N 19°29′27″E)',
     'https://www.wikidata.org/wiki/Q13040657 (Karavastë, P625 40.878, 19.4887) and https://www.wikidata.org/wiki/Q16359491 (Karavastë e Re, P625 40.8778, 19.4769)',
     'https://sq.wikipedia.org/wiki/Karavasta ("Në perëndim kufizohet me fshatin e Karavastasë së Re" - Karavasta e Re lies to its west)',
     ow('node', 728425225) + ' (position used; OSM names this node "Karavasta e Re")',
     ow('node', 728424535) + ' (OSM "Karavasta", ~1 km west; the other sources call this settlement Karavasta e Re)'],
    'Position = OSM place node 728425225, the eastern of the two Karavasta villages south of the lagoon. Google Maps calls it "Karavasta Fshat". '
    'Do not link users to the OSM node by name: OSM labels it "Karavasta e Re".',
    'OSM vs the rest: OSM names the western node (728424535, 40.8778, 19.4770) "Karavasta" and this eastern node "Karavasta e Re" (unchanged since 2011, '
    'wikidata tags added 2025-12-04 cross-link to items whose coordinates are the other village). Google Maps, GeoNames, Wikidata P625 and the sq.wikipedia text '
    'all put Karavasta east and Karavasta e Re west. Medium (not high) because OSM disagrees; the builder had used the OSM western node.')

lat, lon = osm_ll('node/11025002431')
poi('infopoint', 'information', 'Pika e informacionit e Parkut Kombëtar', 'National Park infopoint', lat, lon, ow('node', 11025002431), 'medium', ow('node', 11025002431),
    None, 'OSM tourism=information "Infopoint National Park Divjaka-Karavasta", on the forest track west of the visitor centre.')

lat, lon = osm_ll('node/13765370901')
poi('lagoon-boat-trips', 'boat_trips', 'Shëtitje me varkë në lagunë', 'Lagoon boat trips', lat, lon, ow('node', 13765370901), 'medium', ow('node', 13765370901),
    [ow('node', 13765370901), 'research/heritage.json visit-06 (AKT: boat trips on the lagoon)'],
    'OSM tourism=attraction "Lagoon Boat Trips" on the canal east of the visitor centre, by the road bridge. Operator/schedule not verified.')

lat, lon = center_of('way', 1089837162)
poi('boardwalk', 'boardwalk', 'Shteg druri mbi ujë', 'Wooden boardwalk', lat, lon, ow('way', 1089837162), 'medium', ow('way', 1089837162),
    None, 'OSM highway=path bridge=boardwalk surface=wood (24 nodes) between the visitor centre and the canal. Coordinate = vertex average. No name in OSM.')

lat, lon = center_of('way', 1388562406)
poi('footbridge-canal', 'footbridge', 'Urë këmbësorësh mbi kanal', 'Footbridge over the canal', lat, lon, ow('way', 1388562406), 'medium', ow('way', 1388562406),
    None, 'OSM highway=footway bridge=yes bicycle=yes, beside the road bridge (way 302285077) at the lagoon boat point.')

lat, lon = center_of('way', 1170877709)
poi('footbridge-beach', 'footbridge', 'Urë druri te plazhi', 'Wooden footbridge by the beach', lat, lon, ow('way', 1170877709), 'medium', ow('way', 1170877709),
    None, 'OSM highway=footway bridge=yes surface=wood, ~600 m north-west of Hotel Pelikan.')

lat, lon = center_of('way', 559801618)
poi('pier-godulla', 'pier', 'Mol në Lagunën e Godullës', 'Pier on Godulla Lagoon', lat, lon, ow('way', 559801618), 'medium', ow('way', 559801618),
    None, 'OSM man_made=pier highway=footway on the Godulla lagoon shore; OSM bird hide node 12853547415 is ~40 m away.')

lat, lon = osm_ll('node/12853547415')
poi('bird-hide-godulla', 'bird_hide', 'Vendvëzhgim zogjsh te Godulla', 'Bird hide at Godulla', lat, lon, ow('node', 12853547415), 'medium', ow('node', 12853547415),
    None, 'OSM leisure=bird_hide (2025-05), no name.')

lat, lon = center_of('relation', 10092045)
poi('ishulli-hapashalit', 'islet', 'Ishulli Hapashalit', 'Hapashali islet', lat, lon, ow('relation', 10092045), 'medium', ow('relation', 10092045),
    None, 'OSM place=islet, source=GNS. Centre of OSM bounding box.')

poi('pelican-island', 'islet', 'Ishulli i Pelikanit', 'Pelican Island', 40.93639, 19.51778, 'https://en.wikipedia.org/wiki/Pelican_Island_(Albania)', 'low', None,
    ['https://en.wikipedia.org/wiki/Pelican_Island_(Albania)'],
    'Wikipedia EN coordinate (40°56′11″N 19°31′04″E). Closed to the public (research/heritage.json park-23); show as a protected zone, never as a destination.',
    'No islet named Pelican Island exists in OSM; the Wikipedia point lies in open lagoon water in OSM (see geo.md). AOS says the Pelican Trail tower overlooks the island, which is ~3 km from this point. Treat position as approximate. '
    'Verifier 2026-10-23: Esri World Imagery (z16) shows open water and no islet within ~1 km of the point; the AKT page (https://akt.gov.al/en/attractions/Pelican-Island/) gives no location; '
    'en.wikipedia cites no source for the coordinate.')

lat, lon = seman_mouth
poi('seman-mouth', 'river_mouth', 'Grykëderdhja e Semanit', 'Seman river mouth', lat, lon, ow('node', SEMAN_NODE), 'medium', ow('node', SEMAN_NODE),
    [ow('way', 1005011486), ow('node', SEMAN_NODE)], 'Last node of OSM river way 1005011486 "Lumi i Semanit", shared with the coastline. Start of the coast path. River mouths move over time.')

lat, lon = shkumbin_mouth
poi('shkumbin-mouth', 'river_mouth', 'Grykëderdhja e Shkumbinit', 'Shkumbin river mouth', lat, lon, ow('node', SHKUMBIN_NODE), 'medium', ow('node', SHKUMBIN_NODE),
    [ow('way', 386566807), ow('node', SHKUMBIN_NODE)], 'Last node of OSM river way 386566807 "Shkumbini", shared with the coastline. End of the coast path.')

lat, lon = osm_ll('node/8890781407')
poi('altin-nature-collection', 'museum', 'Koleksioni Natyror i Altinit', "Altin's Nature Collection", lat, lon, ow('node', 8890781407), 'medium', ow('node', 8890781407),
    None, 'OSM tourism=museum museum=nature, private (operator Altin Hila), Rruga Zona 20, Divjakë. Opening hours not in OSM.')

lat, lon = osm_ll('node/9033692799')
poi('st-cosmas-monastery', 'monastery', 'Manastiri dhe Varri i Shën Kozmait', 'Monastery and Tomb of Saint Cosmas', lat, lon, ow('node', 9033692799), 'medium', ow('node', 9033692799),
    None, 'OSM tourism=attraction; ~22 km by straight line south-east of the hotel, near the southern map edge.')

OSM_NAMED = {'hotel-pelikan', 'visitor-centre', 'tower-360', 'divjake-centre', 'divjaka-beach',
             'infopoint', 'lagoon-boat-trips', 'ishulli-hapashalit', 'altin-nature-collection', 'st-cosmas-monastery'}
for p in pois:
    if p['id'] == 'pelican-island':
        p['name_source'] = 'wikipedia'
    elif p['id'] == 'karavasta-village':
        p['name_source'] = 'Google Maps ("Karavasta Fshat"), GeoNames, Wikidata, sq.wikipedia - not OSM, which names this node "Karavasta e Re"'
    elif p['id'] in OSM_NAMED:
        p['name_source'] = 'osm (name_sq may be the Albanian form of the OSM name)'
    else:
        p['name_source'] = 'descriptive label - the OSM object has no name'

# Pelican Island check against lagoon water + islets
pi_xy = proj(40.93639, 19.51778)
pi_in_lagoon = pip(pi_xy, outer[0])
pi_in_islet = any(pip(pi_xy, r) for _, r in inner)
report['pelican_island_wikipedia_point'] = dict(xy=[round(v, 1) for v in pi_xy], inside_lagoon_outer=pi_in_lagoon, inside_any_osm_islet=pi_in_islet)

# ---------------------------------------------------------------- write geo.json
geo = {
    'title': 'Karavasta lagoon & Divjakë-Karavasta National Park - geographic base',
    'generated': datetime.date.today().isoformat(),
    'attribution': '© OpenStreetMap contributors, ODbL',
    'license_note': 'Geometry derived from OpenStreetMap (ODbL 1.0). Show the attribution wherever the map is displayed: https://www.openstreetmap.org/copyright',
    'projection': {
        'type': 'equirectangular (plate carrée) with cos(lat0) x-scaling, spherical Earth',
        'lat0': round(LAT0, 4), 'cos_lat0': round(K, 6),
        'bbox': {'lon_min': LON_MIN, 'lon_max': LON_MAX, 'lat_min': LAT_MIN, 'lat_max': LAT_MAX},
        'units_per_degree_lat': round(S, 4),
        'units_per_degree_lon': round(S * K, 4),
        'formula': 'x = (lon - lon_min) * cos_lat0 * units_per_degree_lat ; y = (lat_max - lat) * units_per_degree_lat',
        'inverse': 'lat = lat_max - y / units_per_degree_lat ; lon = lon_min + x / (cos_lat0 * units_per_degree_lat)',
        'earth_radius_km': 6371.0088,
        'note': 'Over this 0.26 degree box the cos(lat) scale varies < 0.4%, so distances measured on the map are good to about that.',
    },
    'viewBox': f'0 0 {fmt(W)} {fmt(H)}',
    'width': W, 'height': H,
    'scale_km_per_unit': round(KM_PER_UNIT, 6),
    'scale_units_per_km': round(1 / KM_PER_UNIT, 4),
    'paths': {
        'lagoon': lagoon_d,
        'lagoon_outline': lagoon_outline_d,
        'lagoons_other': lagoons_other,
        'coast': coast_d,
        'coast_full': coast_full_d,
        'coast_islands': islands,
        'sea': sea_d,
        'park': park_d,
        'forest': forest_d,
        'forest_other': forest_other,
        'roads': roads,
        'rivers': rivers,
        'boardwalks': bw,
    },
    'path_notes': {
        'lagoon': 'Karavasta Lagoon, OSM relation 10092047 (natural=water, water=lagoon). Subpath 1 = outer shore, the rest = islets (use fill-rule="evenodd").',
        'lagoon_outline': 'Outer shore only (subpath 1 of lagoon) - for a stroke/self-drawing animation.',
        'lagoons_other': 'Other water bodies on the barrier/south coast. Unnamed ones have no name in OSM - do not invent names. in_park = centroid inside the park boundary.',
        'coast': 'Single open polyline from the Seman mouth (start, south) to the Shkumbin mouth (end, north), OSM natural=coastline. It follows the inlet ("external godulla") and sand spits north of the beach as OSM maps them. Stroke only.',
        'coast_full': 'Same coastline clipped to the viewBox (north edge -> south edge).',
        'sea': 'Sea fill = area west of coast_full; island subpaths are holes (fill-rule="evenodd").',
        'park': 'Parku Kombëtar Divjakë-Karavasta, OSM way 503885261 (boundary=national_park, protect_class=2, ref:WDPA=4679).',
        'forest': 'Coastal forest strip, OSM way 295114375 (landuse=forest, no name/leaf_type in OSM) = the Divjaka pine forest area by location.',
        'forest_other': 'Other coastal woods in the box (OSM), clipped to the viewBox. 1074182709 is the wood near the Seman mouth, not the Divjaka pine forest.',
        'roads': 'Main roads into Divjakë, clipped to the viewBox. Labels are descriptive, not official names.',
        'rivers': 'Lower Seman and Shkumbin (OSM waterway=river centrelines), clipped to the viewBox.',
        'boardwalks': 'OSM boardwalk / footbridges / pier near the visitor centre and the beach (tiny at this scale).',
    },
    'pois': pois,
    'build_report': report,
    'verification': {
        'date': '2026-10-23',
        'by': 'independent verifier (see geo.md "## Verification")',
        'method': 'All path data parsed (M/L/Z only, no NaN, inside the viewBox); POI x/y recomputed from lat/lon; every OSM element re-fetched from the OSM API 0.6; '
                  'paths overlaid on OSM standard tiles (z12, z16, z17) and Esri World Imagery (z13, z16, z18) reprojected into this system; Wikipedia, Wikidata, GeoNames and Google Maps cross-checks.',
        'result': 'Coast, lagoon shore, forest strip, park boundary and pins line up with the satellite imagery to within about 1-2 units (20-40 m). Sea is west. '
                  'Lagoon outer ring 42.2 km2 (net of islets 42.05 km2) vs en.wikipedia/Wikidata 42 km2; long axis bearing about 20 deg (NNE-SSW). '
                  'Fixed: Karavasta village moved ~1 km east (OSM has the two village names swapped); visitor-centre and tower-360 raised to high (Google Maps agrees within 18 m / 7 m); in_park added to POIs; legend moved off the Karavasta pin.',
    },
}
os.makedirs(OUT, exist_ok=True)
json.dump(geo, open(os.path.join(OUT, 'geo.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- preview SVG
conf_col = {'high': '#1b7f3b', 'medium': '#c27c0e', 'low': '#c0392b'}
MAJOR = {  # id: (dx, dy, anchor) for the name label on the main map
    'hotel-pelikan': (-10, 5, 'end'), 'divjake-centre': (10, 5, 'start'), 'visitor-centre': (10, -10, 'start'),
    'pelican-tower': (10, 5, 'start'), 'karavasta-village': (-10, 5, 'end'), 'seman-mouth': (10, 5, 'start'),
    'shkumbin-mouth': (10, 5, 'start'), 'pelican-island': (10, 5, 'start'), 'st-cosmas-monastery': (-10, -2, 'end'),
    'ishulli-hapashalit': (10, 5, 'start'), 'altin-nature-collection': (10, 16, 'start'),
}
INSET_SRC = (470.0, 330.0, 150.0, 150.0)   # x, y, w, h in map units
INSET_DST = (24.0, 150.0, 300.0, 300.0)    # where it is drawn
num = {p['id']: k + 1 for k, p in enumerate(pois)}

def in_inset(p):
    x, y, w, h = INSET_SRC
    return x <= p['x'] <= x + w and y <= p['y'] <= y + h

sv = []
sv.append(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {fmt(W)} {fmt(H)}" width="{fmt(W)}" height="{fmt(H)}" font-family="Segoe UI, Arial, sans-serif">')
sv.append('<title>Karavasta lagoon and Divjakë-Karavasta National Park - preview</title>')
sv.append('<style>.lbl{font-size:12px;fill:#1d2a33;paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}'
          '.big{font-size:14px;font-weight:600}.num{font-size:10px;font-weight:700;fill:#fff;stroke:none}'
          '.wl{font-size:14px;font-style:italic;fill:#245c85;paint-order:stroke;stroke:#fff;stroke-width:3px}'
          '.leg{font-size:11px;fill:#1d2a33}.legh{font-size:12.5px;font-weight:700;fill:#1d2a33}</style>')
sv.append('<defs><g id="map">')
sv.append(f'<rect x="0" y="0" width="{fmt(W)}" height="{fmt(H)}" fill="#f2efe6"/>')
sv.append(f'<path id="sea" d="{sea_d}" fill="#b9d8ea" fill-rule="evenodd"/>')
for f in forest_other:
    sv.append(f'<path d="{f["d"]}" fill="#cfe2c4"/>')
sv.append(f'<path id="forest" d="{forest_d}" fill="#9cc78e"/>')
for lo in lagoons_other:
    sv.append(f'<path d="{lo["d"]}" fill="#9fc9e6" stroke="#4b88b8" stroke-width="0.6" fill-rule="evenodd"/>')
sv.append(f'<path id="lagoon" d="{lagoon_d}" fill="#8cbfe3" stroke="#2f6f9f" stroke-width="0.8" fill-rule="evenodd"/>')
for r in rivers:
    sv.append(f'<path d="{r["d"]}" fill="none" stroke="#5c9fd0" stroke-width="1.6"/>')
for r in roads:
    w_ = {'secondary': 2.4, 'tertiary': 1.8, 'unclassified': 1.6}[r['highway']]
    sv.append(f'<path d="{r["d"]}" fill="none" stroke="#fff" stroke-width="{w_ + 1.6}" stroke-linecap="round" stroke-linejoin="round"/>')
    sv.append(f'<path d="{r["d"]}" fill="none" stroke="#d29a2a" stroke-width="{w_}" stroke-linecap="round" stroke-linejoin="round"/>')
for b in bw:
    sv.append(f'<path d="{b["d"]}" fill="none" stroke="#7a4b20" stroke-width="1.2"/>')
sv.append(f'<path id="park" d="{park_d}" fill="none" stroke="#2e7d32" stroke-width="1.6" stroke-dasharray="7 4"/>')
sv.append(f'<path id="coast" d="{coast_d}" fill="none" stroke="#12324d" stroke-width="1.8" stroke-linejoin="round"/>')
sv.append('</g></defs>')
sv.append('<use href="#map" xlink:href="#map"/>')
# water / area labels
for lat_, lon_, txt, cls, extra in ((40.925, 19.488, 'Laguna e Karavastasë', 'wl', ''), (40.95, 19.375, 'Deti Adriatik', 'wl', ''),
                                    (40.848, 19.455, 'Parku Kombëtar Divjakë-Karavasta (kufiri)', 'lbl', ' fill="#2e7d32"')):
    lx, ly = proj(lat_, lon_)
    sv.append(f'<text class="{cls}" x="{fmt(lx)}" y="{fmt(ly)}" text-anchor="middle"{extra}>{txt}</text>')

placed = []
OFFS = [(0, 0), (0, -17), (17, 0), (0, 17), (-17, 0), (13, -13), (13, 13), (-13, 13), (-13, -13), (0, -32), (30, 0), (0, 32), (-30, 0)]

def pin(x, y, p, r_):
    """Numbered pin; if it would overlap an already placed pin, move it and draw a leader to the true point."""
    c = conf_col[p['confidence']]
    for ox, oy in OFFS:
        px, py = x + ox, y + oy
        if all(math.hypot(px - qx, py - qy) >= 2 * r_ + 1 for qx, qy in placed):
            break
    placed.append((px, py))
    out = ''
    if (px, py) != (x, y):
        out += (f'<path d="M{fmt(x)} {fmt(y)}L{fmt(px)} {fmt(py)}" stroke="#1d2a33" stroke-width="1"/>'
                f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="2.2" fill="#1d2a33"/>')
    out += (f'<circle cx="{fmt(px)}" cy="{fmt(py)}" r="{r_}" fill="{c}" stroke="#fff" stroke-width="1.5"/>'
            f'<text class="lbl num" x="{fmt(px)}" y="{fmt(py + 3.5)}" text-anchor="middle">{num[p["id"]]}</text>')
    return out

# frame of the inset area on the main map
ix, iy, iw, ih = INSET_SRC
sv.append(f'<rect x="{fmt(ix)}" y="{fmt(iy)}" width="{fmt(iw)}" height="{fmt(ih)}" fill="none" stroke="#1d2a33" stroke-width="1" stroke-dasharray="3 3"/>')
for p in pois:
    if not p['in_view']:
        continue
    if in_inset(p):
        sv.append(f'<circle cx="{fmt(p["x"])}" cy="{fmt(p["y"])}" r="2.5" fill="{conf_col[p["confidence"]]}" stroke="#fff" stroke-width="0.8"/>')
        continue
    sv.append(pin(p['x'], p['y'], p, 7))
    if p['id'] in MAJOR:
        dx, dy, an = MAJOR[p['id']]
        sv.append(f'<text class="lbl big" x="{fmt(p["x"] + dx)}" y="{fmt(p["y"] + dy)}" text-anchor="{an}">{p["name_sq"]}</text>')
# inset (magnified 2x) of the visitor-centre / beach cluster
dx0, dy0, dw, dh = INSET_DST
sc = dw / iw
sv.append(f'<svg x="{fmt(dx0)}" y="{fmt(dy0)}" width="{fmt(dw)}" height="{fmt(dh)}" viewBox="{fmt(ix)} {fmt(iy)} {fmt(iw)} {fmt(ih)}"><use href="#map" xlink:href="#map"/></svg>')
sv.append(f'<rect x="{fmt(dx0)}" y="{fmt(dy0)}" width="{fmt(dw)}" height="{fmt(dh)}" fill="none" stroke="#1d2a33" stroke-width="1.5"/>')
sv.append(f'<text class="lbl" x="{fmt(dx0)}" y="{fmt(dy0 - 6)}">Zmadhim 2× / 2× zoom: plazhi – Qendra e Vizitorëve</text>')
placed.clear()
for p in pois:
    if p['in_view'] and in_inset(p):
        x = dx0 + (p['x'] - ix) * sc; y = dy0 + (p['y'] - iy) * sc
        sv.append(pin(x, y, p, 7))
# legend (verifier 2026-10-23: moved right from x=560 so it no longer hides the Karavasta pin at x~563, y~957)
lx0, ly0 = 588, 950
rows = len(pois)
sv.append(f'<rect x="{lx0 - 12}" y="{ly0 - 22}" width="{W - lx0 + 2}" height="{rows * 15 + 92}" fill="#fff" fill-opacity="0.9" stroke="#c9c3b3"/>')
sv.append(f'<text class="legh" x="{lx0}" y="{ly0 - 4}">Pikat / POIs (ngjyra = besueshmëria e vendndodhjes)</text>')
for k, p in enumerate(pois):
    y = ly0 + 14 + k * 15
    sv.append(f'<circle cx="{lx0 + 6}" cy="{y - 4}" r="6" fill="{conf_col[p["confidence"]]}"/>'
              f'<text class="lbl num" x="{lx0 + 6}" y="{y - 0.5}" text-anchor="middle">{num[p["id"]]}</text>')
    sv.append(f'<text class="leg" x="{lx0 + 18}" y="{y}">{p["name_sq"]} — {p["name_en"]}</text>')
y = ly0 + 14 + rows * 15 + 8
for k, (c, t) in enumerate((('#1b7f3b', 'e lartë / high'), ('#c27c0e', 'mesatare / medium'), ('#c0392b', 'e ulët / low'))):
    sv.append(f'<circle cx="{lx0 + 6 + k * 120}" cy="{y - 4}" r="5" fill="{c}"/><text class="leg" x="{lx0 + 16 + k * 120}" y="{y}">{t}</text>')
# scale bar 5 km + north arrow + attribution
u5 = 5 / KM_PER_UNIT
sx, sy = 40, H - 40
sv.append(f'<path d="M{fmt(sx)} {fmt(sy)}h{fmt(u5)}" stroke="#1d2a33" stroke-width="3"/>')
sv.append(f'<path d="M{fmt(sx)} {fmt(sy - 6)}v12M{fmt(sx + u5)} {fmt(sy - 6)}v12M{fmt(sx + u5 / 2)} {fmt(sy - 4)}v8" stroke="#1d2a33" stroke-width="1.5"/>')
sv.append(f'<text class="lbl" x="{fmt(sx)}" y="{fmt(sy - 10)}">0</text><text class="lbl" x="{fmt(sx + u5)}" y="{fmt(sy - 10)}" text-anchor="middle">5 km</text>')
sv.append(f'<path d="M{fmt(W - 40)} 30l-10 26h20z" fill="#1d2a33"/><text class="lbl" x="{fmt(W - 40)}" y="74" text-anchor="middle">N</text>')
sv.append(f'<text class="leg" x="{lx0}" y="{ly0 + rows * 15 + 46}" font-weight="600">© OpenStreetMap contributors, ODbL</text>')
sv.append('</svg>')
open(os.path.join(OUT, 'lagoon-map.svg'), 'w', encoding='utf-8').write('\n'.join(sv))

print(json.dumps(report, indent=1))
print('viewBox', geo['viewBox'], 'km/unit', geo['scale_km_per_unit'])
for lo in lagoons_other:
    print(lo['id'], lo['name_sq'], 'in_park', lo['in_park'], 'km2', lo['area_km2'], 'pts', lo['points'])
for r in roads:
    print(r['id'], 'chains', r['chains'], 'pts', r['points'])
for r in rivers:
    print(r['id'], 'pts', r['points'])
print('boardwalks', [b['id'] for b in bw])
for p in pois:
    print(p['id'], p['lat'], p['lon'], p['x'], p['y'], p['in_view'], p['confidence'])
