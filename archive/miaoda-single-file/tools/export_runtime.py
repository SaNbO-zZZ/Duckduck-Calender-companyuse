"""Export the canonical source HTML runtime blocks into the current Miaoda repo."""
from __future__ import annotations
import html, json, re, hashlib
from pathlib import Path
root = Path(__file__).resolve().parents[1]
source_path = root / 'source/鸭鸭日历.html'
text = source_path.read_text()
for match in re.finditer(r'<script type="text/plain" data-runtime-source="([^"]+)">\n(.*?)\n</script>', text, re.S):
    target = (root / match[1]).resolve()
    if not target.is_relative_to(root.resolve()): raise ValueError('unsafe export path')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html.unescape(match[2]))
visual = re.sub(r'<script type="text/plain" data-runtime-source="[^"]+">\n.*?\n</script>', '', text, flags=re.S)
visual = re.sub(r'const EMBED_RAW = \{.*?\};', 'const EMBED_RAW = window.duckSpriteData;', visual, flags=re.S)
bridge = (root / 'client/src/pages/Calendar/frame-runtime.js').read_text()
visual = visual.replace('</head>', '<script>window.duckSpriteData = /*__DUCK_SPRITE_DATA__*/;\n'+bridge+'</script></head>')
old = (root / 'client/src/pages/Calendar/calendar-document.ts').read_text() if (root / 'client/src/pages/Calendar/calendar-document.ts').exists() else ''
match = re.search(r'export const spriteUrl = (.*?);\n', old)
sprite = json.loads(match.group(1)) if match else '/spark/app/app_17fstqsqv1c/runtime/api/v1/storage/object/bucket_aadkzip6foyts/1878663148282906.json'
(root / 'client/src/pages/Calendar/calendar-document.ts').write_text('/* Generated from the canonical HTML; do not edit. */\nexport const spriteUrl = '+json.dumps(sprite)+';\nexport const calendarDocument = '+json.dumps(visual, ensure_ascii=False)+';\n')
(root / 'source-provenance.json').write_text(json.dumps({'source': 'source/鸭鸭日历.html', 'sha256': hashlib.sha256(source_path.read_bytes()).hexdigest(), 'generated': True}, ensure_ascii=False, indent=2)+'\n')
print('exported runtime blocks and calendar document')
