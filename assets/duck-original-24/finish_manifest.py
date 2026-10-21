"""Join the first edition and the 15 newly generated independent actions."""
from pathlib import Path
import json

root=Path(__file__).resolve().parent
old=json.loads((root.parent/'duck-pixel-gif'/'source-manifest.json').read_text())
names=['嘎？','听我狡辩','溜了溜了','当场发疯','我裂开了','已读乱回','鸭力山大','开摆','拿捏']
categories=['互动吐槽','互动吐槽','日常接话','抽象发疯','情绪反应','互动吐槽','情绪反应','抽象发疯','亲密互动']
scenes=['没听懂、疑惑','嘴硬、解释','告辞、退出话题','情绪爆发','崩溃、被打击','敷衍接话','焦虑、工作压力','躺平、懒得动','得意、胜券在握']
actions=['歪头左看右看 → 眼睛瞪圆 → 死鱼眼','伸脖子争辩 → 大嘴张到最大 → 翅膀补充说明','背身摇屁股 → 交替迈脚 → 回头偷看','翅膀乱拍 → 脖子歪掉 → 大嘴嚎叫','长脖子失去支撑 → 身体下沉 → 瘫成鸭饼','认真点头 → 仰头乱嘎 → 闭眼满意','脖子缩短 → 捧脸冒汗 → 缓一口气','肚子朝上躺倒 → 双脚翘起 → 悠闲左右摇','半眯眼挑眉 → 翅尖一捏 → 装淡定']
seqs=[[0,1,2,3],[0,1,2,1,2,3],[0,1,2,3],[0,1,2,1,3,1,2,3],[0,1,2,2,3,1],[0,1,0,1,2,3],[0,1,2,1,2,3],[0,1,2,3],[0,1,2,3]]
durs=[[320,160,400,320],[300,100,160,100,220,180],[140]*4,[90]*8,[260,160,300,240,180,160],[250,120,120,120,200,450],[260,160,170,160,250,200],[260,180,260,180],[300,180,420,240]]
for i,r in enumerate(old):
    r.update(name=names[i],category=categories[i],scene=scenes[i],action=actions[i],seq=seqs[i],dur=durs[i])
new=json.loads((root/'generated-new-10-24.json').read_text())
for r in new:
    if not isinstance(r['dur'],list):r['dur']=[100]*len(r['seq'])
records=old+new
assert len(records)==24
for r in records:
    assert len(r['seq'])==len(r['dur'])
    assert all(0<=n<4 for n in r['seq'])
    assert Path(r['path']).is_file()
(root/'source-manifest.json').write_text(json.dumps(records,ensure_ascii=False,indent=2))
print('Ready: 24 independent designs, all source images present.')
