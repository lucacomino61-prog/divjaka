import sys, urllib.request, urllib.parse, json, time
q = open(sys.argv[1], encoding='utf-8').read()
out = sys.argv[2]
eps = ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter']*3
for i,ep in enumerate(eps):
    try:
        data = urllib.parse.urlencode({'data': q}).encode()
        req = urllib.request.Request(ep, data=data, headers={'User-Agent':'divjaka-map-research/1.0 (one-off map build)'})
        with urllib.request.urlopen(req, timeout=120) as r:
            b = r.read()
        j = json.loads(b)
        open(out,'wb').write(b)
        print(ep, 'OK elements', len(j.get('elements',[])), 'remark', j.get('remark'))
        sys.exit(0)
    except Exception as e:
        print(ep, 'FAIL', e, flush=True); time.sleep(20)
sys.exit(1)
