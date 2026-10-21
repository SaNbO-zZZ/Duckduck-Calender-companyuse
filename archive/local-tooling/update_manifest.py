"""在核验或发布准备完成后记录资料库文件摘要；清单自身不纳入摘要。"""
from pathlib import Path
import os
from datetime import datetime
import hashlib, json

root = Path(__file__).resolve().parents[1]
files = []
excluded_dirs = {'node_modules', '.git', '.npm_cache', '.cache', 'dist', 'logs', '.agent', '.agents', '.claude'}
for directory, dirs, names in os.walk(root, followlinks=False):
    dirs[:] = sorted(d for d in dirs if d not in excluded_dirs)
    for name in sorted(names):
        p = Path(directory) / name
        if name in {'file-manifest.json', '.DS_Store'} or name.startswith('.env') or p.is_symlink(): continue
        files.append({'path': str(p.relative_to(root)), 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()})
manifest = {'created_at': datetime.now().isoformat(timespec='seconds'), 'root': str(root), 'file_count': len(files), 'total_bytes': sum(f['bytes'] for f in files), 'files': files}
(root / 'file-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
print(json.dumps({k: manifest[k] for k in ['file_count', 'total_bytes']}, ensure_ascii=False))
