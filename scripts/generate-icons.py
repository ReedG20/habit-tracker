"""
Builds every app icon / splash asset from assets/brand/ante-mark.svg.

    python3 scripts/generate-icons.py [preview-dir]

Needs rsvg-convert (`brew install librsvg`). The mark is re-centered and scaled
so the same source works for the iOS Icon Composer bundle (72% of the canvas)
and Android's adaptive icon, whose circular mask only guarantees the middle 66%.
"""
import re, subprocess, zlib, struct, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT/'assets/brand/ante-mark.svg'
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
BRAND = '#4121FF'

def render(svg_text, w, h, out):
    p = subprocess.run(['rsvg-convert','-w',str(w),'-h',str(h),'-o',str(out)], input=svg_text.encode(), check=True)

def alpha_bbox(png):
    d=png.read_bytes(); pos=8; idat=b''
    while pos<len(d):
        ln,=struct.unpack('>I',d[pos:pos+4]); t=d[pos+4:pos+8]; c=d[pos+8:pos+8+ln]
        if t==b'IHDR': w,h,bd,ct=struct.unpack('>IIBB',c[:10])
        if t==b'IDAT': idat+=c
        pos+=12+ln
    assert ct==6
    raw=zlib.decompress(idat); bpp=4; stride=w*bpp; prev=bytearray(stride); i=0; xs=[]; ys=[]
    for y in range(h):
        f=raw[i]; line=bytearray(raw[i+1:i+1+stride]); i+=1+stride
        for x in range(stride):
            a=line[x-bpp] if x>=bpp else 0; b=prev[x]; c=prev[x-bpp] if x>=bpp else 0
            if f==1: line[x]=(line[x]+a)&255
            elif f==2: line[x]=(line[x]+b)&255
            elif f==3: line[x]=(line[x]+(a+b)//2)&255
            elif f==4:
                p=a+b-c; pa,pb,pc=abs(p-a),abs(p-b),abs(p-c)
                line[x]=(line[x]+(a if pa<=pb and pa<=pc else b if pb<=pc else c))&255
        prev=line
        row=[x for x in range(w) if line[x*4+3]>0]
        if row: xs+= [row[0],row[-1]]; ys.append(y)
    return min(xs),max(xs),min(ys),max(ys)

src = SRC.read_text()
inner = re.search(r'<svg[^>]*>(.*)</svg>', src, re.S).group(1).strip()

# Measure the mark's real bounds at full resolution.
tmp = ROOT/'assets/brand/.measure.png'; render(src, 1024, 1024, tmp)
x0,x1,y0,y1 = alpha_bbox(tmp); tmp.unlink()
bw, bh = x1-x0+1, y1-y0+1
print(f'source mark bbox: x {x0}-{x1} y {y0}-{y1} ({bw}x{bh})')

def centered_svg(width_frac, canvas=1024, fill=None, background=None):
    """Mark scaled to `width_frac` of the canvas and centered."""
    s = width_frac*canvas/bw
    tx = (canvas - bw*s)/2 - x0*s
    ty = (canvas - bh*s)/2 - y0*s
    body = inner if fill is None else inner.replace('fill="white"', f'fill="{fill}"')
    bg = f'<rect width="{canvas}" height="{canvas}" fill="{background}"/>' if background else ''
    return (f'<svg width="{canvas}" height="{canvas}" viewBox="0 0 {canvas} {canvas}" fill="none" xmlns="http://www.w3.org/2000/svg">'
            f'{bg}<g transform="translate({tx:.3f} {ty:.3f}) scale({s:.5f})">{body}</g></svg>')

def cropped_svg(pad_frac=0.06):
    """Just the mark, tightly cropped with a little padding (for the splash)."""
    pad = bw*pad_frac
    W, H = bw+2*pad, bh+2*pad
    return (f'<svg width="{W:.0f}" height="{H:.0f}" viewBox="{x0-pad:.3f} {y0-pad:.3f} {W:.3f} {H:.3f}" fill="none" xmlns="http://www.w3.org/2000/svg">{inner}</svg>')

IOS_W, ANDROID_W = 0.72, 0.62

img = ROOT/'assets/images'
render(centered_svg(IOS_W, background=BRAND), 1024, 1024, img/'icon.png')
render(centered_svg(ANDROID_W), 1024, 1024, img/'android-icon-foreground.png')
render(centered_svg(ANDROID_W), 1024, 1024, img/'android-icon-monochrome.png')
render(centered_svg(IOS_W, background=BRAND), 48, 48, img/'favicon.png')
crop = cropped_svg(); cw = float(re.search(r'width="([\d.]+)"', crop).group(1)); ch = float(re.search(r'height="([\d.]+)"', crop).group(1))
render(crop, 1024, round(1024*ch/cw), img/'splash-icon.png')

icon = ROOT/'assets/ante.icon'; (icon/'Assets').mkdir(parents=True, exist_ok=True)
(icon/'Assets/ante-mark.svg').write_text(centered_svg(IOS_W))
r,g,b = (int(BRAND[i:i+2],16)/255 for i in (1,3,5))
(icon/'icon.json').write_text(f'''{{
  "fill" : {{
    "solid" : "extended-srgb:{r:.5f},{g:.5f},{b:.5f},1.00000"
  }},
  "groups" : [
    {{
      "layers" : [
        {{
          "image-name" : "ante-mark.svg",
          "name" : "ante-mark"
        }}
      ],
      "shadow" : {{
        "kind" : "neutral",
        "opacity" : 0.5
      }},
      "translucency" : {{
        "enabled" : true,
        "value" : 0.5
      }}
    }}
  ],
  "supported-platforms" : {{
    "circles" : [
      "watchOS"
    ],
    "squares" : "shared"
  }}
}}
''')
if OUT:
    render(centered_svg(IOS_W, background=BRAND), 256, 256, OUT/'preview-ios.png')
    render(centered_svg(ANDROID_W, background=BRAND), 256, 256, OUT/'preview-android.png')
print('done')
