"""Split a cleaned 6x6 transparent contact sheet into 256px idle direction frames."""
from __future__ import annotations
import argparse, json, math
from pathlib import Path
from PIL import Image
import numpy as np
from scipy import ndimage

parser = argparse.ArgumentParser()
parser.add_argument('source')
parser.add_argument('output_dir')
parser.add_argument('--threshold', type=int, default=64)
parser.add_argument('--prefix', default='idle')
args = parser.parse_args()
source = Path(args.source); out = Path(args.output_dir); out.mkdir(parents=True, exist_ok=True)
im = Image.open(source).convert('RGBA')
arr = np.array(im)
arr[:, :, 3] = np.where(arr[:, :, 3] >= args.threshold, arr[:, :, 3], 0)
clean = Image.fromarray(arr)
width, height = clean.size
metrics = []
for index in range(36):
    row, col = divmod(index, 6)
    x0 = round(col * width / 6); x1 = round((col + 1) * width / 6)
    y0 = round(row * height / 6); y1 = round((row + 1) * height / 6)
    cell = clean.crop((x0, y0, x1, y1))
    cell_arr = np.array(cell)
    binary = cell_arr[:, :, 3] >= args.threshold
    labels, count = ndimage.label(binary, structure=np.ones((3, 3)))
    sizes = np.bincount(labels.ravel())
    keep = sizes >= 100
    keep[0] = False
    cell_arr[:, :, 3] = np.where(keep[labels], cell_arr[:, :, 3], 0)
    cell = Image.fromarray(cell_arr)
    alpha = np.array(cell)[:, :, 3]
    bbox = cell.getbbox()
    canvas = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    if bbox:
        subject = cell.crop(bbox)
        # Keep a consistent maximum subject height while preserving each view's silhouette.
        target_h = 232
        scale = min(target_h / subject.height, 232 / subject.width)
        resized = subject.resize((max(1, round(subject.width * scale)), max(1, round(subject.height * scale))), Image.Resampling.LANCZOS)
        x = (256 - resized.width) // 2
        y = 12 + (232 - resized.height)
        canvas.alpha_composite(resized, (x, y))
        rb = canvas.getbbox()
        ca = np.array(canvas)[:, :, 3]
        ys = np.where(ca > 0)[0]
        metrics.append({
            'index': index, 'row': row, 'column': col, 'angleDegrees': index * 10,
            'bbox': list(rb) if rb else None, 'alphaPixels': int((ca > 0).sum()),
            'bottom': int(ys.max()) if len(ys) else None,
        })
    else:
        metrics.append({'index': index, 'row': row, 'column': col, 'angleDegrees': index * 10, 'bbox': None, 'alphaPixels': 0, 'bottom': None})
    canvas.save(out / f'{args.prefix}-{index:02d}.png')
report = {
    'source': str(source), 'frames': len(metrics), 'canvas': '256x256',
    'angleStepDegrees': 10, 'transparent': True, 'threshold': args.threshold,
    'metrics': metrics,
    'bottomSpread': max(m['bottom'] for m in metrics if m['bottom'] is not None) - min(m['bottom'] for m in metrics if m['bottom'] is not None),
}
(out / 'consistency-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'frames': report['frames'], 'bottomSpread': report['bottomSpread'], 'emptyFrames': sum(m['alphaPixels'] == 0 for m in metrics)}, ensure_ascii=False))
