"""Stellt das Produkt-Rendering frei (schwarzes Objekt auf hellem Metall) -> halterung.png + Farbvarianten.
Aufruf: python3 freistellen.py  (Eingabe: halterung-original.png)"""
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage as ndi
src=Image.open('halterung-original.png').convert('RGB')
W,H=src.size
up=src.resize((W*2,H*2),Image.LANCZOS)
a=np.asarray(up).astype(float)
L=0.299*a[...,0]+0.587*a[...,1]+0.114*a[...,2]
core=L<92
lab,n=ndi.label(core)
sizes=ndi.sum(np.ones_like(L),lab,range(1,n+1))
core=np.isin(lab,1+np.where(sizes>3000)[0])
core=ndi.binary_opening(core,iterations=1)|(core&(L<60))
lab,n=ndi.label(core)
sizes=ndi.sum(np.ones_like(L),lab,range(1,n+1))
core=lab==(1+int(np.argmax(sizes)))
print('components',n)
dist=ndi.distance_transform_edt(~core)
soft=np.clip((150-L)/(150-92),0,1)
alpha=np.where(core,1.0,soft*np.clip(1-dist/3.5,0,1))
alpha=ndi.gaussian_filter(alpha,0.7)
dark=np.minimum(a,70)
w=(np.clip((alpha-0.55)/0.4,0,1)*np.clip((118-L)/22,0,1))[...,None]
rgb=a*w+dark*(1-w)
im=Image.fromarray(np.dstack([rgb,alpha*255]).clip(0,255).astype('uint8'),'RGBA')
im=im.filter(ImageFilter.UnsharpMask(radius=2,percent=60,threshold=2))
im=im.crop(im.getbbox())
# Reste der Spiegelungen unter hinterer Stütze und rechtem Fuß entfernen
arr=np.asarray(im).copy()
arr[350:,:100,3]=0
arr[900:,1250:1390,3]=0
im=Image.fromarray(arr,'RGBA')
print('size',im.size)
im.save('halterung.png')
# Farbvarianten (Helligkeit -> Farbverlauf), für die Szene "Deine Farbe"
fa=np.asarray(im).astype(float)
FL=0.299*fa[...,0]+0.587*fa[...,1]+0.114*fa[...,2]
ft=np.clip(FL/105,0,1)**0.85
for name,col in [('rot',(205,22,30)),('blau',(30,85,200)),('gelb',(235,185,25))]:
    c=np.array(col,float)
    rgb=c*0.22+(c*1.05-c*0.22)*ft[...,None]+np.clip((FL-95)/60,0,1)[...,None]*60
    Image.fromarray(np.dstack([np.clip(rgb,0,255),fa[...,3]]).astype('uint8'),'RGBA').save(f'halterung-{name}.png')
