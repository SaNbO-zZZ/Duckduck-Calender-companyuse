"""Build deterministic action sprite sheets from the approved idle direction frames.

The transforms are deliberately restrained: they preserve the approved character pixels
and only add animation timing cues (scale, tilt and vertical offset).
"""
from __future__ import annotations
import argparse
from pathlib import Path
from PIL import Image, ImageEnhance

ACTIONS = {
    'react': ([9, 10], [(1.00, 0, 0, 0), (1.06, 0, -4, -2)]),
    'walk-left': ([9, 10, 11], [(1.00, 0, 0, 0), (1.01, -6, 1, 2), (1.02, -12, 2, 4)]),
    'peek': ([27, 28], [(0.94, 0, 8, 2), (1.02, 0, -2, -2)]),
    'jump': ([31, 32], [(1.00, 0, 8, 0), (1.08, 0, -8, -3)]),
}


def transformed(frame: Image.Image, scale: float, dx: int, dy: int, angle: float) -> Image.Image:
    frame = frame.convert('RGBA')
    w = max(1, round(256 * scale)); h = max(1, round(256 * scale))
    resized = frame.resize((w, h), Image.Resampling.LANCZOS)
    rotated = resized.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    canvas = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    x = (256 - rotated.width) // 2 + dx
    y = (256 - rotated.height) // 2 + dy
    canvas.alpha_composite(rotated, (x, y))
    return canvas


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('frames_root', type=Path)
    p.add_argument('output_root', type=Path)
    args = p.parse_args()
    roles = sorted(x.name for x in args.frames_root.iterdir() if x.is_dir() and (x / 'idle').is_dir())
    for role in roles:
        idle = args.frames_root / role / 'idle'
        out = args.output_root / role
        out.mkdir(parents=True, exist_ok=True)
        for name, (indices, transforms) in ACTIONS.items():
            sheet = Image.new('RGBA', (256 * len(indices), 256), (0, 0, 0, 0))
            for i, (index, transform) in enumerate(zip(indices, transforms)):
                frame = Image.open(idle / f'idle-{index:02d}.png')
                # React/jump are intentionally warmer and brighter only through motion scale;
                # no color edits are applied so the master palette remains unchanged.
                action = transformed(frame, *transform)
                sheet.alpha_composite(action, (i * 256, 0))
            sheet.save(out / f'{name}-sheet.png', optimize=True)
            for i, index in enumerate(indices):
                frame = Image.open(idle / f'idle-{index:02d}.png')
                action = transformed(frame, *transforms[i])
                action.save(out / f'{name}-{i:02d}.png', optimize=True)
    print({'roles': roles, 'actions': list(ACTIONS), 'framesPerRole': {k: len(v[0]) for k, v in ACTIONS.items()}})


if __name__ == '__main__':
    main()
