"""Local, bounded retouching of the manually reviewed NASA marks.

Run with --prepare to create review files under the OS temp directory; --apply
publishes them only after exact outside-mask/alpha/frame-timing verification.
Requires Pillow, numpy and OpenCV. Originals stay outside assets in the audit
directory; the repository retains the original versions in Git as well.
"""
import argparse
import hashlib
import json
import shutil
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
AUDIT = Path(tempfile.gettempdir()) / 'nasa-logo-audit'
ORIGINAL = AUDIT / 'originals'
OUTPUT = AUDIT / 'edited'

# Coordinates refer to the original full canvas, never a trimmed sprite.
REGIONS = {
    'assets/menu/robot.png': [(187,99,226,141)],
    'assets/menu/toolkit.png': [(147,94,189,133)],
    'assets/scene/crew/active/action-atlas-v1.png': [(259,153,295,191),(874,155,902,192,'side'),(298,891,326,926,'kneel'),(866,772,907,812)],
    'assets/scene/crew/astronaut_a/seated.png': [(950,514,992,551),(1063,525,1087,541,'letters')],
    'assets/scene/crew/astronaut_a/sleep.png': [(958,524,998,559),(1073,549,1096,563,'letters')],
    'assets/scene/crew/astronaut_a/tired.png': [(959,562,1001,597),(1075,561,1098,574,'letters')],
    'assets/scene/crew/astronaut_b/seated.png': [(609,509,652,545),(560,531,592,547,'letters')],
    'assets/scene/crew/astronaut_b/sleep.png': [(623,551,665,587),(573,574,605,591,'letters')],
    'assets/scene/crew/astronaut_b/tired.png': [(613,540,655,575),(552,536,578,550,'letters')],
    'assets/scene/tools/robot/ready.png': [(244,806,283,848)],
    'assets/scene/tools/toolkit/ready.png': [(876,738,905,767)],
    'assets/scene/init_game/Animation/NASA Atlas V Fairing Clamshell-4.png': [(245,617,512,901,'grain')],
    'assets/scene/init_game/Animation/exec-182d3f3a-5fdc-44c9-802a-95a6942e5ce2.png': [(245,617,512,901,'grain')],
    'assets/scene/ends/GE.jpg': [(1067,410,1238,582,'hatch')],
    'assets/scene/ends/TGE.jpg': [(1067,410,1238,582),(1757,1063,1823,1118),(1868,957,1925,991,'white')],
}

def original(path):
    backup = ORIGINAL / path
    if not backup.exists():
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / path, backup)
    return backup

def mask_region(rgb, region):
    x0,y0,x1,y1,*modes = region
    mode = modes[0] if modes else 'logo'
    if mode in ['side','kneel']:
        polygon=([(878,171),(880,165),(884,162),(889,164),(891,170),(895,165),(895,169),(891,175),(891,182),(887,188),(880,191),(877,186)]
                 if mode=='side' else [(303,900),(307,896),(311,897),(316,903),(320,900),(320,904),(318,909),(321,918),(317,925),(311,925),(305,921),(302,912)])
        full=np.zeros(rgb.shape[:2],dtype='uint8');cv2.fillPoly(full,[np.array(polygon,dtype='int32')],255)
        return cv2.dilate(full,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(3,3)))
    crop = rgb[y0:y1,x0:x1].astype(np.int16)
    r,g,b = crop[:,:,0],crop[:,:,1],crop[:,:,2]
    blue = (b-r>15)&(b-g>5)
    red = (r>g*1.3)&(r>b*1.4)
    near_blue = cv2.dilate(blue.astype('uint8'),np.ones((7,7),dtype='uint8'))>0
    count,labels=cv2.connectedComponents(red.astype('uint8'))
    connected_red=np.zeros_like(red)
    for label in range(1,count):
        part=labels==label
        if (part&near_blue).any(): connected_red|=part
    seed = blue if mode=='letters' else ((r>130)&(g>130)&(b>130) if mode=='white' else blue|connected_red)
    mask = (seed*255).astype('uint8')
    if mode not in ['letters','white']:
        points=cv2.findNonZero(mask)
        if points is not None: cv2.fillConvexPoly(mask,cv2.convexHull(points),255)
    if (x0,y0)==(1067,410):
        for polygon in [[(1071,548),(1077,537),(1094,525),(1097,538)],[(1097,575),(1114,550),(1123,542),(1119,554),(1100,580)],[(1227,413),(1234,409),(1230,429),(1217,450),(1210,456)]]:
            cv2.fillPoly(mask,[np.array([(x-x0,y-y0) for x,y in polygon],dtype='int32')],255)
    mask = cv2.dilate(mask,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(3,3)),iterations=5 if mode=='hatch' else 3 if x1-x0>100 else 1)
    full = np.zeros(rgb.shape[:2],dtype='uint8');full[y0:y1,x0:x1] = mask
    if mode=='hatch':
        # The opened door occludes the logo's right edge. Keep its outline intact.
        for y in range(y0,y1):
            edge=np.flatnonzero(rgb[y,1192:1260].max(axis=1)<95)
            if len(edge): full[y,1192+edge[0]:]=0
    return full

def retouch(rgba, regions):
    before = np.array(rgba)
    rgb = before[:,:,:3].copy()
    fullmask = np.zeros(rgb.shape[:2],dtype='uint8')
    for region in regions:
        mask = mask_region(before[:,:,:3],region)
        repaired = cv2.inpaint(rgb,mask,3,cv2.INPAINT_TELEA)
        if len(region)>4 and region[4] in ['side','kneel']:
            x0,y0,x1,y1=region[:4];crop=before[y0:y1,x0:x1,:3].astype('float64')
            yy,xx=np.indices(crop.shape[:2]);clean=(mask[y0:y1,x0:x1]==0)&(crop.min(axis=2)>135)&(crop.max(axis=2)-crop.min(axis=2)<70)
            design=np.stack([np.ones_like(xx),xx/(x1-x0),yy/(y1-y0)],axis=2)
            fit=np.linalg.lstsq(design[clean],crop[clean],rcond=None)[0]
            repaired[y0:y1,x0:x1]=np.clip(design@fit,0,255).astype('uint8')
        if len(region)>4 and region[4]=='hatch':
            # The other ending depicts this exact hull with its door closed.
            # Borrow its already-cleaned material, keeping GE's open door intact.
            donor,_=retouch(Image.open(original('assets/scene/ends/TGE.jpg')).convert('RGBA'),REGIONS['assets/scene/ends/TGE.jpg'][:1])
            weight=np.minimum(cv2.distanceTransform(mask,cv2.DIST_L2,3)/4,1)[:,:,None]
            repaired=np.clip(np.array(donor)[:,:,:3]*weight+rgb*(1-weight),0,255).astype('uint8')
        if len(region)>4 and region[4]=='grain':
            # Reintroduce the same paper grain from a clean part of the fairing.
            swatch = rgb[420:540,355:475].astype('float32')
            grain = swatch-cv2.GaussianBlur(swatch,(0,0),3)
            texture = np.tile(grain,(int(rgb.shape[0]/120)+1,int(rgb.shape[1]/120)+1,1))[:rgb.shape[0],:rgb.shape[1]]
            weight = np.minimum(cv2.distanceTransform(mask,cv2.DIST_L2,3)/8,1)[:,:,None]
            repaired = np.clip(repaired.astype('float32')+texture*weight,0,255).astype('uint8')
        rgb[mask>0] = repaired[mask>0]
        fullmask |= mask
    result = before.copy();result[:,:,:3] = rgb
    assert np.array_equal(before[fullmask==0],result[fullmask==0])
    assert np.array_equal(before[:,:,3],result[:,:,3])
    return Image.fromarray(result),fullmask

def save_gif_frame(source, edited, mask):
    # Build a palette from the decoded original frame. Unedited colors are exact;
    # only repaired pixels are mapped to their closest existing palette color.
    a = np.array(source)
    opaque = a[:,:,3]>0
    colors,inverse = np.unique(a[:,:,:3][opaque],axis=0,return_inverse=True)
    assert len(colors)<=255 if not opaque.all() else len(colors)<=256
    indices = np.zeros(a.shape[:2],dtype='uint8')
    indices[opaque] = inverse.astype('uint8')
    change = (mask>0)&opaque
    values = np.array(edited)[:,:,:3][change].astype('int32')
    if len(values):
        # Use chunks to bound memory for long animations.
        mapped=[]
        for start in range(0,len(values),1000):
            distances=((values[start:start+1000,None,:]-colors.astype('int32')[None,:,:])**2).sum(axis=2)
            mapped.extend(distances.argmin(axis=1))
        indices[change] = np.array(mapped,dtype='uint8')
    palette = colors.ravel().tolist()+[0]*(768-colors.size)
    if not opaque.all(): indices[~opaque]=255
    result = Image.fromarray(indices,'P');result.putpalette(palette)
    if not opaque.all(): result.info['transparency']=255
    return result

def gif_regions(frame, reference, kind):
    if kind=='rocket': return [(327,105,376,147)]
    rgb=np.array(frame.convert('RGB'));base=np.array(reference.convert('RGB'))
    regions=[]
    # Track each chest patch separately through the camera's movement.
    for box,polygon in [((222,327,256,367),[(238,333),(247,336),(254,339),(248,345),(247,352),(240,359),(236,358),(237,350),(239,348)]),
                        ((497,337,540,379),[(509,345),(519,344),(531,351),(535,350),(530,357),(530,364),(525,373),(518,377),(514,369),(516,365)])]:
        x0,y0,x1,y1=box
        sx,sy=max(0,x0-50),max(0,y0-50)
        search=rgb[sy:y1+50,sx:x1+50]
        match=cv2.matchTemplate(search,base[y0:y1,x0:x1],cv2.TM_CCOEFF_NORMED)
        _,score,_,pos=cv2.minMaxLoc(match)
        assert score>.7,score
        dx,dy=sx+pos[0]-x0,sy+pos[1]-y0
        regions.append(np.array([(x+dx,y+dy) for x,y in polygon],dtype='int32'))
    return regions

def process_gif(path, kind):
    src=original(path);im=Image.open(src);reference=im.convert('RGBA')
    frames=[];originals=[];masks=[];durations=[]
    for index in range(im.n_frames):
        im.seek(index);frame=im.convert('RGBA');originals.append(frame);durations.append(im.info.get('duration',40))
        if kind=='rocket': edited,mask=retouch(frame,gif_regions(frame,reference,kind))
        else:
            a=np.array(frame);mask=np.zeros(a.shape[:2],dtype='uint8')
            for poly in gif_regions(frame,reference,kind): cv2.fillPoly(mask,[poly],255)
            b=a.copy();repair=cv2.inpaint(a[:,:,:3],mask,3,cv2.INPAINT_TELEA);b[mask>0,:3]=repair[mask>0]
            edited=Image.fromarray(b)
        masks.append(mask);frames.append(save_gif_frame(frame,edited,mask))
    out=OUTPUT/path;out.parent.mkdir(parents=True,exist_ok=True)
    kwargs={'transparency':255} if kind=='rocket' else {}
    frames[0].save(out,save_all=True,append_images=frames[1:],duration=durations,loop=im.info.get('loop',0),disposal=2,optimize=False,**kwargs)
    check=Image.open(out);assert check.n_frames==len(frames)
    changed=0
    for i,(old,mask) in enumerate(zip(originals,masks)):
        check.seek(i);a=np.array(old);b=np.array(check.convert('RGBA'))
        # Hidden RGB on fully transparent GIF pixels has no visual meaning.
        outside=(mask==0)&(a[:,:,3]>0)
        assert np.array_equal(a[outside],b[outside]),(path,i,'outside')
        assert np.array_equal(a[:,:,3],b[:,:,3]),(path,i,'alpha')
        assert check.info['duration']==durations[i]
        changed+=int(np.any(a[:,:,:3]!=b[:,:,:3],axis=2)[a[:,:,3]>0].sum())
        if i in [0,len(frames)//2,len(frames)-1]: Image.fromarray(b).save(AUDIT/f'after-{kind}-{i}.png')
    return {'path':path,'output':path,'frames':len(frames),'changedPixels':changed,'outsideMaskUnchanged':True,'alphaUnchanged':True,'timingUnchanged':True}

def prepare():
    report=[]
    for path,regions in REGIONS.items():
        src=original(path);im=Image.open(src).convert('RGBA')
        edited,mask=retouch(im,regions)
        target=Path(path).with_suffix('.png').as_posix()
        out=OUTPUT/target;out.parent.mkdir(parents=True,exist_ok=True);edited.save(out)
        check=np.array(Image.open(out).convert('RGBA'));before=np.array(im)
        assert np.array_equal(check[mask==0],before[mask==0])
        report.append({'path':path,'output':target,'regions':regions,'frames':1,'changedPixels':int(np.any(before!=check,axis=2).sum()),'outsideMaskUnchanged':True,'alphaUnchanged':True,'sha256Before':hashlib.sha256(src.read_bytes()).hexdigest()})
    for path,kind in [('assets/scene/init_game/rocket_launch.gif','rocket'),('assets/scene/init_game/camera_pip.gif','camera')]:
        report.append(process_gif(path,kind))
    (AUDIT/'result.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print('Prepared and verified',len(report),'assets in',OUTPUT)

def apply():
    report=json.loads((AUDIT/'result.json').read_text(encoding='utf8'))
    for entry in report:
        source=ROOT/entry['path'];dest=ROOT/entry['output']
        assert source.resolve().is_relative_to(ROOT/'assets')
        shutil.copy2(OUTPUT/entry['output'],dest)
        if source!=dest: source.unlink()
    target=ROOT/'reports/nasa-logo-removal.json';target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps({'inspectedImages':82,'editedImages':report},indent=2)+'\n',encoding='utf8')
    print('Published',len(report),'assets')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--prepare',action='store_true');parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    if args.prepare: prepare()
    if args.apply: apply()
