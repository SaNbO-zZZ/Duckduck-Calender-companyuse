"""Export platform adapters from the sole editable HTML. Generated files are not sources."""
from pathlib import Path
import html, re, hashlib, json, subprocess

root = Path(__file__).resolve().parents[1]
source = root / '鸭鸭日历.html'
repo = root / 'deployment/duck-calendar-runtime'
text = source.read_text()
for match in re.finditer(r'<script type="text/plain" data-runtime-source="([^"]+)">\n(.*?)\n</script>', text, re.S):
    target = (repo / match[1]).resolve()
    if not target.is_relative_to(repo.resolve()): raise ValueError('Unsafe export path')
    target.parent.mkdir(parents=True, exist_ok=True)
    previous = subprocess.run(
        ['git', 'show', f'HEAD:{match[1]}'], cwd=repo,
        capture_output=True, check=False,
    )
    trailing_newline = previous.returncode == 0 and previous.stdout.endswith(b'\n')
    target.write_text(html.unescape(match[2]) + ('\n' if trailing_newline else ''))
visual = re.sub(r'<script type="text/plain" data-runtime-source="[^"]+">\n.*?\n</script>', '', text, flags=re.S)
visual = re.sub(r'const EMBED_RAW = \{.*?\};', 'const EMBED_RAW = window.duckSpriteData;', visual, flags=re.S)
festival_files = json.loads((root / 'deployment/halloween-assets.json').read_text())['files']
asset_expression = 'HALLOWEEN_ASSET_BASE + asset'
if visual.count(asset_expression) != 1:
    raise ValueError('Halloween asset source expression changed; review runtime export')
if set(festival_files) != {'day-desktop.webp', 'day-mobile.webp', 'night-desktop.webp', 'night-mobile.webp'}:
    raise ValueError('Halloween upload manifest is incomplete')
visual = visual.replace(asset_expression, json.dumps(festival_files, ensure_ascii=False) + '[asset]')
bridge = (repo / 'client/src/pages/Calendar/frame-runtime.js').read_text()
visual = visual.replace('</head>', '<script>window.duckSpriteData = /*__DUCK_SPRITE_DATA__*/;\n'+bridge+'</script></head>')
sprite = json.loads((root/'deployment/duck-sprite-upload.json').read_text())['data']['download_url']
(repo/'client/src/pages/Calendar/calendar-document.ts').write_text('/* Generated from the canonical HTML; do not edit. */\nexport const spriteUrl = '+json.dumps(sprite)+';\nexport const calendarDocument = '+json.dumps(visual,ensure_ascii=False)+';\n')
(repo / 'source-provenance.json').write_text(json.dumps({'source': '鸭鸭日历.html', 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'generated': True}, indent=2))
