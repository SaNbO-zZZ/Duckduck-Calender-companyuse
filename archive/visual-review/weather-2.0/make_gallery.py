# -*- coding: utf-8 -*-
from pathlib import Path
from urllib.parse import quote
from PIL import Image, ImageDraw, ImageFont, ImageOps
import html

root = Path(__file__).parent
names = ["晴天", "阴天", "小雨", "大雨", "强风", "大雨＋强风", "雪天", "晴天夜间"]
files = []
for name in names:
    filename = "候选-晴天-夜晚.png" if name == "晴天夜间" else "候选-" + name + "-白天.png"
    path = root / filename
    if path.exists():
        files.append((name, path))
if not files:
    raise SystemExit("还没有实际候选渲染图")

fontpath = "/System/Library/Fonts/STHeiti Medium.ttc"
font = ImageFont.truetype(fontpath, 25)
small = ImageFont.truetype(fontpath, 18)
title = ImageFont.truetype(fontpath, 36)
width, top, tilew, tileh, gap = 1600, 130, 375, 300, 20
height = top + ((len(files) + 3) // 4) * (tileh + 60 + gap) + 70
sheet = Image.new("RGB", (width, height), "#f2f4f7")
draw = ImageDraw.Draw(sheet)
draw.text((30, 25), "鸭鸭日历 · 天气背景审查", font=title, fill="#25303a")
draw.text((30, 80), "本地候选，未上线 ｜ 实际 WebGL 静帧 ｜ 动态效果请看视频或交互预览", font=small, fill="#647281")
cards = []
for i, (name, path) in enumerate(files):
    x, y = 20 + (i % 4) * (tilew + gap), top + (i // 4) * (tileh + 60 + gap)
    image = Image.open(path).convert("RGB")
    fitted = ImageOps.contain(image, (tilew, tileh))
    draw.rounded_rectangle((x, y, x + tilew, y + tileh + 55), radius=14, fill="white")
    sheet.paste(fitted, (x + (tilew - fitted.width) // 2, y + (tileh - fitted.height) // 2))
    draw.text((x + 18, y + tileh + 14), name, font=font, fill="#263440")
    video = path.with_suffix(".webm")
    media = '<video controls muted loop playsinline preload="none" poster="' + quote(path.name) + '" src="' + quote(video.name) + '"></video>' if video.exists() else '<img src="' + quote(path.name) + '" alt="' + html.escape(name) + '">'
    cards.append('<article><h2>' + html.escape(name) + '</h2>' + media + '<a href="' + quote(path.name) + '">查看背景原图</a></article>')
draw.text((30, height - 45), "强风主要通过运动速度、雨丝倾角与阵风表现。静帧不能代替动态审查。", font=small, fill="#647281")
sheet.save(root / "天气效果对照.png")
page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>鸭鸭日历 · 天气效果画廊</title><style>body{margin:0;background:#f2f4f7;color:#25303a;font:16px -apple-system,"PingFang SC",sans-serif;padding:32px;max-width:1440px;margin:auto}h1{font-size:34px;margin:0 0 12px}p{color:#687785;line-height:1.8}a{color:#476a9b;text-decoration:none}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{background:white;padding:22px;border-radius:22px}h2{font-size:20px;margin:0 0 16px}img,video{width:100%;max-height:460px;object-fit:contain;display:block;background:#e7edf3;border-radius:14px;margin-bottom:15px}.tag{display:inline-block;background:#ffe7db;color:#a55a35;padding:6px 12px;border-radius:20px;font-size:13px}@media(max-width:760px){body{padding:20px}main{grid-template-columns:1fr}}</style><span class="tag">本地候选 · 未上线</span><h1>先看天气，再看日历</h1><p>这些图片和视频均导出自可运行的 WebGL 背景。天气为演示场景；不连接员工记录。请优先比较小雨、大雨与大雨加强风的运动差别，以及云层、水珠和雪花是否足够克制。</p><p><a href="review.html">打开交互预览</a>　<a href="review.html?phone=1">打开手机宽度预览</a></p><main>'''
for name, filename in [("桌面晴天 · 页面示意", "桌面-晴天-页面.jpeg"), ("手机大雨 · 页面示意", "手机-大雨-页面.jpeg")]:
    cards.append('<article><h2>' + name + '</h2><img src="' + quote(filename) + '"><a href="' + quote(filename) + '">查看完整页面画面</a></article>')
page += "".join(cards) + "</main><p>桌面浏览器实测不代表飞书手机真机性能。系统减少动态效果会停止动画，仍保留同天气的静态画面。</p></html>"
(root / "gallery.html").write_text(page)
print("画廊已生成：", len(files), "个实际天气画面")
