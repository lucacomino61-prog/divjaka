import math, urllib.request, time, sys
from PIL import Image
z=int(sys.argv[1]); LON0,LON1,LAT0,LAT1=[float(v) for v in sys.argv[2:6]]
def tx(lon): return (lon+180)/360*2**z
def ty(lat):
    r=math.radians(lat); return (1-math.log(math.tan(r)+1/math.cos(r))/math.pi)/2*2**z
x0,x1=int(tx(LON0)),int(tx(LON1)); y0,y1=int(ty(LAT1)),int(ty(LAT0))
print(x0,x1,y0,y1)
im=Image.new('RGB',((x1-x0+1)*256,(y1-y0+1)*256))
for x in range(x0,x1+1):
    for y in range(y0,y1+1):
        fn=f'tiles/{z}_{x}_{y}.png'
        try: t=Image.open(fn)
        except Exception:
            req=urllib.request.Request(f'https://tile.openstreetmap.org/{z}/{x}/{y}.png',headers={'User-Agent':'divjaka-map-research/1.0 (one-off map verification)'})
            open(fn,'wb').write(urllib.request.urlopen(req,timeout=60).read()); time.sleep(0.5); t=Image.open(fn)
        im.paste(t.convert('RGB'),((x-x0)*256,(y-y0)*256))
# crop to bbox
L=(tx(LON0)-x0)*256; R=(tx(LON1)-x0)*256; T=(ty(LAT1)-y0)*256; B=(ty(LAT0)-y0)*256
im=im.crop((int(L),int(T),int(R),int(B)))
im.save(f'tiles/mosaic_{z}.png'); print(im.size)
