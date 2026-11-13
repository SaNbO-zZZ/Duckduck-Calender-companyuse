"""Generate lightweight, transparent SVG duty-duck sprite sheets for Miaoda storage.
The SVGs keep the 36-view/action contract small enough for local QA; they are not employee data.
"""
from __future__ import annotations
import json, math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp/duty-assets/duty-ducks-v1"
OUT.mkdir(parents=True, exist_ok=True)
ROLES = {
    "mia": {"body": "#f2b632", "accent": "#3e7dcc", "beak": "#ed7b26"},
    "momo": {"body": "#f6d45b", "accent": "#d85065", "beak": "#ee7e27"},
    "zhangsanbo": {"body": "#e6ad2f", "accent": "#4a9c64", "beak": "#ea7624"},
    "barra": {"body": "#f0a83a", "accent": "#8d5a38", "beak": "#e67825"},
    "ziyu": {"body": "#f0c84a", "accent": "#8454b8", "beak": "#e87a27"},
    "jiajia": {"body": "#f6d84f", "accent": "#e88aa1", "beak": "#ee7d27"},
    "billy": {"body": "#edb938", "accent": "#3a78a8", "beak": "#e87824"},
}

def duck_group(spec, frame_id, transform=""):
    # 256x256 transparent canvas; compact 2.5D toy-like silhouette.
    visible = '' if frame_id == 'idle-09' else ' style="display:none"'
    return f'''<g id="{frame_id}"{visible} transform="{transform}">
  <ellipse cx="128" cy="224" rx="55" ry="9" fill="#3e2d2140"/>
  <ellipse cx="128" cy="148" rx="68" ry="67" fill="{spec['body']}"/>
  <circle cx="128" cy="84" r="55" fill="{spec['body']}"/>
  <path d="M77 75 C84 28 105 18 128 18 C151 18 173 29 179 75 C163 62 94 62 77 75Z" fill="{spec['accent']}" opacity=".95"/>
  <ellipse cx="108" cy="80" rx="9" ry="13" fill="#2b231e"/><ellipse cx="148" cy="80" rx="9" ry="13" fill="#2b231e"/>
  <circle cx="105" cy="76" r="3" fill="#fff"/><circle cx="145" cy="76" r="3" fill="#fff"/>
  <path d="M106 97 Q128 112 150 97 Q144 125 128 126 Q112 125 106 97Z" fill="{spec['beak']}"/>
  <path d="M74 142 Q128 164 182 142 L176 166 Q128 185 80 166Z" fill="{spec['accent']}" opacity=".92"/>
  <path d="M95 197 Q87 217 77 229" stroke="{spec['beak']}" stroke-width="13" stroke-linecap="round"/>
  <path d="M161 197 Q169 217 179 229" stroke="{spec['beak']}" stroke-width="13" stroke-linecap="round"/>
</g>'''

def make_sheet(role, spec):
    pieces = []
    for i in range(36):
        angle = i * 10
        # Small perspective cue while keeping a stable frame box.
        sx = 0.82 + 0.18 * abs(math.cos(math.radians(angle)))
        tx = 128 + math.sin(math.radians(angle)) * 6
        pieces.append(duck_group(spec, f"idle-{i:02d}", f"translate({tx-128:.2f} 0) scale({sx:.3f} 1)"))
    for i, (name, extra) in enumerate([
        ("react-00", "rotate(-4 128 150)"), ("react-01", "rotate(4 128 150)"),
        ("walk-left-00", "translate(-5 0)"), ("walk-left-01", "translate(0 -4)"),
        ("walk-left-02", "translate(5 0)"), ("peek-00", "translate(-14 20) scale(.86)"),
        ("peek-01", "translate(-8 4) scale(.94)"), ("jump-00", "translate(0 -14) rotate(-6 128 150)"),
        ("jump-01", "translate(0 -28) rotate(7 128 150)"),
    ]):
        pieces.append(duck_group(spec, name, extra))
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="duty duck {role}"><defs></defs>{''.join(pieces)}</svg>'''
    path = OUT / f"{role}.svg"
    path.write_text(svg)
    return path

manifest = {
    "manifestVersion": "duty-ducks-v1",
    "generatedAt": "2026-11-12T00:00:00+08:00",
    "canvas": {"width": 256, "height": 256, "format": "svg", "transparent": True},
    "fallback": "static/duck-fallback.svg",
    "roles": {},
}
for role, spec in ROLES.items():
    path = make_sheet(role, spec)
    manifest["roles"][role] = {
        "assetPath": f"/duty-ducks-v1/{path.name}",
        "idleDirections": [f"idle-{i:02d}" for i in range(36)],
        "actions": {
            "react": ["react-00", "react-01"],
            "walkLeft": ["walk-left-00", "walk-left-01", "walk-left-02"],
            "peek": ["peek-00", "peek-01"],
            "jump": ["jump-00", "jump-01"],
        },
        "thumbnail": "idle-09",
        "staticFallback": "idle-00",
        "spec": {"body": spec["body"], "accent": spec["accent"], "beak": spec["beak"]},
    }
(ROOT / "tmp/duty-assets/duty-ducks-v1/manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"output": str(OUT), "roles": len(ROLES), "directionsPerRole": 36, "actionsPerRole": 9}, ensure_ascii=False))
