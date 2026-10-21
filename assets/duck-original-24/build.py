from pathlib import Path
import json, subprocess, sys, concurrent.futures, zipfile
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT/'source-manifest.json').read_text())
SKILL = '/Users/mia/.codex/skills/generate2dsprite/scripts/generate2dsprite.py'
NAMES = [r['name'] for r in DATA]
SEQS = [r['seq'] for r in DATA]
DURS = [r['dur'] for r in DATA]

def process(r):
    out=ROOT/'source'/r['id']; out.mkdir(parents=True,exist_ok=True)
    (out/'prompt-used.txt').write_text(r['prompt'])
    if not (out/'pipeline-meta.json').exists():
        corrected=out/'input-regridded.png'
        input_path=str(corrected) if corrected.exists() else r['path']
        subprocess.run([sys.executable,SKILL,'process','--input',input_path,'--target','creature','--mode','idle','--output-dir',str(out),'--rows','2','--cols','2','--cell-size','256','--fit-scale','0.9','--align','feet','--shared-scale','--component-mode','all','--trim-border','0','--edge-clean-depth','0','--reject-edge-touch','--prompt-file',str(out/'prompt-used.txt')],check=True,capture_output=True)
    print('processed',r['id'],flush=True)

# Deterministic processing only: artwork comes entirely from generated sheets.
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(process,DATA))

COLORS=['#000000','#302821','#574134','#80603d','#aa642c','#dd8229','#f6a33c','#ffb958','#fffdf0','#e3ddcc','#cbc4b4','#a69e8d','#e47772','#fda395','#257caa','#53bfe6','#a7e7f5','#ffffff','#497843','#8bb75f','#bc4644','#fff07c']
RGB=np.array([tuple(bytes.fromhex(c[1:])) for c in COLORS],dtype=np.int32)
PALETTE=[0,0,0]+[v for color in RGB[1:] for v in color]
PALETTE += [0]*(768-len(PALETTE))
FONT=ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc',18)

def quantize(im):
    a=np.array(im)
    dist=((a[:,:,:3].astype(np.int32)[:,:,None,:]-RGB[None,None,1:,:])**2).sum(axis=3)
    indices=(dist.argmin(axis=2)+1).astype('uint8')
    indices[a[:,:,3]<160]=0
    out=Image.fromarray(indices,'P'); out.putpalette(PALETTE); out.info['transparency']=0
    return out

def caption(text):
    box=FONT.getbbox(text); w=box[2]-box[0]; h=box[3]-box[1]
    mask=Image.new('L',(w+8,h+8)); ImageDraw.Draw(mask).text((4-box[0],4-box[1]),text,font=FONT,fill=255,stroke_width=0)
    mask=mask.point(lambda v:255 if v>=90 else 0)
    outline=mask.filter(ImageFilter.MaxFilter(5))
    layer=Image.new('RGBA',mask.size); layer.paste((255,255,255,255),(0,0),outline); layer.paste((48,40,33,255),(0,0),mask)
    return layer

def savegif(frames,path,durations):
    frames[0].save(path,save_all=True,append_images=frames[1:],duration=durations,loop=0,disposal=2,transparency=0,optimize=False)

for d in ['有字版','无字版','封面PNG']:(ROOT/d).mkdir(exist_ok=True)
allframes=[]; allplain=[]; report=[]
for i,r in enumerate(DATA):
    text=NAMES[i]; tag=r['id']+'_'+text
    originals=[Image.open(ROOT/'source'/r['id']/f'idle-{n}.png').convert('RGBA') for n in range(1,5)]
    if r['id']=='23':
        # Keep the approving wing on the same side throughout the loop.
        originals[3]=originals[3].transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    named=[]; plain=[]
    for im in originals:
        # Quantize to a true 2 px pixel grid with one shared palette.
        small=im.resize((52,52),Image.Resampling.NEAREST)
        pixel=quantize(small).convert('RGBA').resize((104,104),Image.Resampling.NEAREST)
        canvas=Image.new('RGBA',(128,128));canvas.alpha_composite(pixel,(12,-1))
        label=caption(text);canvas.alpha_composite(label,((128-label.width)//2,125-label.height))
        named.append(quantize(canvas))
        body=quantize(im.resize((64,64),Image.Resampling.NEAREST)).resize((128,128),Image.Resampling.NEAREST)
        plain.append(body)
    seq=SEQS[i]; dur=DURS[i]
    savegif([named[n] for n in seq],ROOT/'有字版'/f'{tag}.gif',dur)
    savegif([plain[n] for n in seq],ROOT/'无字版'/f'{tag}.gif',dur)
    named[2].convert('RGBA').save(ROOT/'封面PNG'/f'{tag}.png')
    allframes.append((named,seq,dur))
    allplain.append((plain,seq,dur))
    meta=json.loads((ROOT/'source'/r['id']/'pipeline-meta.json').read_text())
    assert not meta['edge_touch_frames']
    for folder in ['有字版','无字版']:
        path=ROOT/folder/f'{tag}.gif'; gif=Image.open(path)
        assert gif.size==(128,128) and gif.is_animated and gif.info['loop']==0
        for n in range(gif.n_frames):
            gif.seek(n); frame=gif.convert('RGBA'); assert frame.getpixel((0,0))[3]==0
            bbox=frame.getbbox(); assert bbox and bbox[0]>0 and bbox[1]>0 and bbox[2]<128 and bbox[3]<128, (path,bbox)
        report.append({'file':str(path.relative_to(ROOT)),'size':[128,128],'frames':gif.n_frames,'bytes':path.stat().st_size,'loop':0,'transparent':True})

# Preview layout composes the finished GIF frames without drawing new artwork.
def preview(indices,stem,dark=False):
    cols=4; rows=(len(indices)+cols-1)//cols; pages=[]
    for tick in range(60):
        page=Image.new('RGB',(cols*160,rows*160),'#252525' if dark else '#f1ede5')
        draw=ImageDraw.Draw(page)
        for slot,i in enumerate(indices):
            frames,seq,durs=allframes[i]; t=(tick*60)%sum(durs); n=0
            while t>=durs[n]:t-=durs[n];n+=1
            x=(slot%cols)*160;y=(slot//cols)*160
            draw.rounded_rectangle((x+4,y+4,x+155,y+155),radius=12,fill='#333333' if dark else '#ffffff')
            frame=frames[seq[n]].convert('RGBA');page.paste(frame,(x+16,y+16),frame)
        pages.append(page)
    pages[0].save(ROOT/f'{stem}.gif',save_all=True,append_images=pages[1:],duration=60,loop=0,optimize=True)
    pages[6].save(ROOT/f'{stem}.png')

ORDER=[9,10,0,5,11,22,12,13,15,18,17,16,19,6,4,20,3,7,8,21,1,23,2,14]
assert len(DATA)==24 and len(set(ORDER))==24
preview(ORDER,'24款动态总览')
preview(list(range(9,24)),'新增15款预览')
preview(list(range(9,24)),'深色背景检查',True)
(ROOT/'qc-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))

import html as html_module
cards=[]
for i in ORDER:
    r=DATA[i]; tag=r['id']+'_'+r['name']; fresh=int(r['id'])>=10
    cards.append(f'''<article class="card" data-category="{r['category']}" data-new="{str(fresh).lower()}" data-file="{tag}.gif"><div class="meta"><span>{r['id']} / {r['category']}</span>{'<b>NEW</b>' if fresh else ''}</div><a class="asset" href="有字版/{tag}.gif" download aria-label="下载 {r['name']}"><img src="有字版/{tag}.gif" alt="{r['name']}" width="128" height="128"></a><p class="scene">{html_module.escape(r['scene'])}</p><details><summary>动作设计</summary><p>{html_module.escape(r['action'])}</p></details><div class="links"><a href="有字版/{tag}.gif" download>有字 GIF ↓</a><a href="无字版/{tag}.gif" download>无字 GIF ↓</a></div></article>''')
template=(ROOT/'preview-template.html').read_text()
(ROOT/'index.html').write_text(template.replace('{{CARDS}}',''.join(cards)))
(ROOT/'使用说明.txt').write_text('抽象鸭 第二版 · 24 款完整套装\n\n24 款独立动作，24 张有字版 + 24 张无字版 = 48 个 GIF 文件。\n第一版 01–09 保留，10–24 为本次新增。\n\n全部 GIF 为 128×128 像素、透明底、无限循环。传输时保留 GIF 原文件，截图会丢失动画。\n双击 index.html 可预览全部表情，支持分类筛选、只看新增、切换有字/无字和深色背景。\n\n该套装是用户指定的 128px 表情素材，未执行微信上传或表情商店上架。\n专辑投稿尺寸与配套图片需要根据官方当前要求另行准备。\n\n素材制作：内置 image_gen 逐动作生成；generate2dsprite 拆帧去底；本地确定性调色、文字排版、循环 GIF 编码。\n调研来源、逐款设计、提示词分别见调研与24款设计.md、design-manifest.json、source-manifest.json。\n')
manifest=[{k:v for k,v in r.items() if k not in ['path','prompt']} for r in DATA]
(ROOT/'design-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
with zipfile.ZipFile(ROOT/'抽象鸭_24款_128px_GIF表情包.zip','w',zipfile.ZIP_DEFLATED) as z:
    for folder in ['有字版','无字版','封面PNG']:
        for f in sorted((ROOT/folder).iterdir()):z.write(f,str(f.relative_to(ROOT)))
    for name in ['使用说明.txt','24款动态总览.gif','24款动态总览.png','新增15款预览.gif','新增15款预览.png','index.html','调研与24款设计.md','design-manifest.json','source-manifest.json','qc-report.json']:
        z.write(ROOT/name,name)
print(json.dumps({'designs':len(DATA),'gif_files':len(report),'max_gif_bytes':max(x['bytes'] for x in report),'zip_bytes':(ROOT/'抽象鸭_24款_128px_GIF表情包.zip').stat().st_size},ensure_ascii=False),flush=True)
