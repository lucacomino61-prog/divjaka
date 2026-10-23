import urllib.request, json, time, sys
sys.stdout.reconfigure(encoding='utf-8')
items=[('node',11021725056),('way',573637932),('node',8837784839),('way',292705751),('node',11379665876),('node',8738280465),('way',1124509421),
('node',7875214285),('way',234350457),('node',728424535),('node',728425225),('node',728427729),('relation',18096103),('way',1089837162),('way',559801618),('way',1170877709),('way',1388562406),
('node',12853547415),('node',11025002431),('node',13765370901),('relation',10092045),('node',8890781407),('node',9033692799),('relation',10092047),('way',503885261),('way',295004597),('relation',3688163),('way',295114375)]
out={}
for t,i in items:
    url=f'https://api.openstreetmap.org/api/0.6/{t}/{i}.json'
    for attempt in range(3):
        try:
            r=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'divjaka-map-research/1.0 (one-off map build)'}),timeout=60)
            j=json.loads(r.read()); break
        except Exception as e:
            print('ERR',url,e); time.sleep(5); j=None
    if not j: continue
    el=j['elements'][0]
    out[f'{t}/{i}']=el
    print(f'{t}/{i}', el.get('lat'), el.get('lon'), 'v',el.get('version'), el.get('timestamp'), json.dumps(el.get('tags',{}),ensure_ascii=False)[:400])
    time.sleep(0.3)
json.dump(out,open('osm/api_elements.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
