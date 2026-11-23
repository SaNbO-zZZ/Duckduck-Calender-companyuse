"""Write canonical Miaoda runtime source blocks from tracked source files into source HTML."""
from __future__ import annotations
import html, re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=root/'source/鸭鸭日历.html'; text=source.read_text()
for rel in ['client/src/pages/Calendar/DutyDuckStage.tsx','shared/duty-assets.ts']:
    path=re.escape(rel)
    content=html.escape((root/rel).read_text(), quote=False)
    pattern=rf'(<script type="text/plain" data-runtime-source="{path}">\n).*?(\n</script>)'
    text,count=re.subn(pattern, lambda m:m.group(1)+content+m.group(2), text, flags=re.S)
    if count != 1: raise SystemExit(f'expected one block for {rel}, got {count}')
source.write_text(text)
print('synced canonical runtime blocks')
