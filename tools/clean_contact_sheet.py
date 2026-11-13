"""Clean low-alpha speckles from a 6x6 RGBA contact sheet in place/output."""
from __future__ import annotations
import argparse
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

p = argparse.ArgumentParser()
p.add_argument('source')
p.add_argument('output')
p.add_argument('--threshold', type=int, default=64)
p.add_argument('--min-component', type=int, default=100)
a = p.parse_args()
im = Image.open(a.source).convert('RGBA')
arr = np.array(im)
height, width = arr.shape[:2]
for row in range(6):
    for col in range(6):
        x0 = round(col * width / 6); x1 = round((col + 1) * width / 6)
        y0 = round(row * height / 6); y1 = round((row + 1) * height / 6)
        cell = arr[y0:y1, x0:x1]
        alpha = cell[:, :, 3]
        binary = alpha >= a.threshold
        labels, count = ndimage.label(binary, structure=np.ones((3, 3)))
        sizes = np.bincount(labels.ravel(), minlength=count + 1)
        keep = sizes >= a.min_component
        keep[0] = False
        cell[:, :, 3] = np.where(keep[labels], alpha, 0)
        arr[y0:y1, x0:x1] = cell
Path(a.output).parent.mkdir(parents=True, exist_ok=True)
Image.fromarray(arr).save(a.output)
print(a.output)
