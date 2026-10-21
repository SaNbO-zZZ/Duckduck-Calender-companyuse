"""将已确认的日历生产资料集中保存；保留旧路径符号链接，不收集客户端凭证。"""
from pathlib import Path
import hashlib, json, re, shutil
from datetime import datetime

ROOT = Path('/Users/xz/Sanbo/Codex/Company/company_use_calendar')
DESKTOP = Path('/Users/xz/Desktop')
WORK = Path('/Users/xz/Documents/ChatGPT/公司 2')
STAMP = datetime.now().isoformat(timespec='seconds')
mapping = {}
records = []

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def move_link(source, destination):
    source, destination = Path(source), ROOT / destination
    if source.is_symlink() and source.resolve() == destination.resolve():
        mapping[str(source)] = str(destination)
        records.append({'source': str(source), 'destination': str(destination), 'status': 'migrated-alias-verified'})
        return
    if not source.exists():
        records.append({'source': str(source), 'status': 'missing'})
        return
    if destination.exists():
        raise RuntimeError(f'目标已有内容，停止覆盖：{destination}')
    before = {str(p.relative_to(source)): digest(p) for p in source.rglob('*') if p.is_file()} if source.is_dir() else {'': digest(source)}
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source), str(destination))
    after = {str(p.relative_to(destination)): digest(p) for p in destination.rglob('*') if p.is_file()} if destination.is_dir() else {'': digest(destination)}
    assert before == after, f'迁移校验失败：{source}'
    source.symlink_to(destination, target_is_directory=destination.is_dir())
    mapping[str(source)] = str(destination)
    records.append({'source': str(source), 'destination': str(destination), 'files': len(after), 'status': 'moved-and-sha256-verified'})

move_link(DESKTOP / '鸭鸭日历.html', '鸭鸭日历.html')
for name in ['给Claude的开发提示词.md', '给Claude的第二轮优化提示词.md', '给Claude的第三轮优化提示词_3.0.md']:
    move_link(DESKTOP / name, Path('prompts') / name)
move_link(DESKTOP / '鸭鸭日历_3.0参考素材', 'materials/鸭鸭日历_3.0参考素材')
for name in ['鸭鸭日历_3.0审查素材', '鸭鸭日历_本轮审查']:
    move_link(DESKTOP / name, Path('reviews') / name)
move_link(WORK / 'leave-hub', 'feishu/leave-hub')

copies = [
    (Path('/Users/xz/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_o5aux9sxy5x421_0cf3/msg/file/2026-09/鸭儿炒炒炒_原版24款_源素材包(1).zip'), 'materials/原始压缩包/鸭儿炒炒炒_原版24款_源素材包(1).zip'),
    (Path('/Users/xz/.codex/visualizations/2026/09/30/01a0f175-befa-7943-a41d-4e8b1dd46ec3/leave-calendar.html'), 'history/最初视觉设计/leave-calendar.html'),
    (Path('/tmp/duck3'), 'history/第二轮复核工程'),
    (Path('/tmp/duck_calendar_verify.cjs'), 'tests/duck_calendar_verify.cjs'),
    (Path('/tmp/duck_calendar_patch.py'), 'history/本轮修改工具/duck_calendar_patch.py'),
]
for source, rel in copies:
    destination = ROOT / rel
    if source.exists() and not destination.exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        if source.is_dir(): shutil.copytree(source, destination)
        else: shutil.copy2(source, destination)
        records.append({'source': str(source), 'destination': str(destination), 'status': 'copied'})
    elif destination.exists():
        records.append({'source': str(source), 'destination': str(destination), 'status': 'previously-archived'})
    if destination.exists(): mapping[str(source)] = str(destination)

sessions = [
    Path('/Users/xz/.codex/sessions/2026/09/30/rollout-2026-09-30T16-37-00-01a0f175-befa-7943-a41d-4e8b1dd46ec3.jsonl'),
    Path('/Users/xz/.codex/sessions/2026/10/08/rollout-2026-10-08T10-38-31-01a0f175-befa-7943-a41d-4e8b1dd46ec3_01a11960-6b15-70f2-8765-e29466abf1a0.jsonl'),
]
messages = []
seen = set()
for source in sessions:
    if not source.exists(): continue
    with source.open() as stream:
        for line in stream:
            obj = json.loads(line)
            payload = obj.get('payload', {})
            role, content, phase, ident = None, [], '', ''
            # 白名单：只导出人类可见的用户发言、问题回答和助手 commentary/final。
            # 不读取 Reasoning、压缩摘要、system/developer、原始工具记录。
            if obj.get('type') == 'response_item' and payload.get('type') == 'message' and payload.get('role') == 'user':
                role, content, ident = '用户', payload.get('content', []), payload.get('id', '')
            elif obj.get('type') == 'event_msg' and payload.get('type') == 'item_completed':
                item = payload.get('item', {})
                if item.get('type') == 'AgentMessage' and item.get('phase') in ['commentary', 'final', 'final_answer']:
                    role, content, phase, ident = 'Codex', item.get('content', []), item.get('phase'), item.get('id', '')
            if role is None: continue
            text = '\n'.join(c.get('text', '') for c in content if isinstance(c, dict) and c.get('type', '').lower() in ['text', 'input_text', 'output_text']).strip()
            if not text or text.startswith(('<environment_context>', '<external_codex_apps_', '<collaboration_', '<subagent_')): continue
            key = (role, ident) if ident else (role, obj.get('timestamp'), text)
            if key in seen: continue
            seen.add(key)
            if text.startswith('<send_user_message_question_reply>'):
                try:
                    answers = json.loads(text.split('>', 1)[1].rsplit('</', 1)[0])
                    text = '\n\n'.join('问题：' + a.get('question', '') + '\n\n回答：' + a.get('answer', '') for a in answers)
                except (ValueError, KeyError): pass
            text = re.sub(r'(?i)(Bearer\s+)[A-Za-z0-9._~-]{24,}', r'\1[凭证已隐藏]', text)
            messages.append({'timestamp': obj.get('timestamp', ''), 'role': role, 'phase': phase, 'text': text})
messages.sort(key=lambda m: m['timestamp'])

# 复制会话中用户上传的临时图片；这里只取已展示的消息内明确附件路径。
for m in messages:
    for match in re.finditer(r'/var/folders/[^\s<>\)\]"\n]+\.(?:png|jpg|jpeg|webp)', m['text'], re.I):
        source = Path(match.group(0))
        if source.exists():
            dest = ROOT / 'materials/会话附件' / source.name
            dest.parent.mkdir(parents=True, exist_ok=True)
            if not dest.exists(): shutil.copy2(source, dest)
            mapping[str(source)] = str(dest)
        else:
            records.append({'source': str(source), 'status': 'historical-temporary-attachment-unavailable'})

(ROOT / 'conversations').mkdir(exist_ok=True)
transcript = '# 鸭鸭日历 · Codex 可见会话记录\n\n导出时间：' + STAMP + '\n\n来源为本机保存的本会话及其连续会话。仅包含用户消息、问答选择和助手对外发言，不包含内部推理、凭证及原始工具日志。尚未同步到本机的最新消息可能不在导出中。\n\n'
for m in messages:
    transcript += f"## {m['timestamp']} · {m['role']}" + (f" · {m['phase']}" if m['phase'] else '') + '\n\n' + m['text'] + '\n\n'
for old, new in sorted(mapping.items(), key=lambda p: -len(p[0])):
    transcript = transcript.replace(old, new)
(ROOT / 'conversations/Codex可见会话记录.md').write_text(transcript)
(ROOT / 'conversations/Claude资料范围.md').write_text('''# Claude 资料范围与缺口

已归档：三轮交给 Claude 的提示词、当前单文件 HTML 工程、Claude 导出的 3.0 审查截图/视频/性能 CSV、鸭鸭参考素材，以及仍保存在本机的第二轮复核脚本和结果。

本机 Claude 的 `.claude/projects` 不存在；Claude Desktop 的会话目录没有此项目的会话记录或独立项目源码。当前应用代码原本约定集中在一个 HTML 内，因此当前单文件就是可继续修改的工程。未找到额外 package.json/Vite/React 工程，不能声称已收集不存在于本机的文件。

Claude 云端会话原文、其沙箱中未导出到本机的工具或中间文件尚未归档。如果后续导出，请追加到本目录。没有复制 Claude 或 Codex 客户端配置、Cookie、授权凭证、虚拟机运行环境或其他项目。
''')

# 更新正在使用的文档与测试引用；保留文档迁移前版本以供历史追溯。
for directory in ['prompts', 'reviews', 'feishu', 'tests']:
    for file in (ROOT / directory).rglob('*'):
        if not file.is_file() or file.suffix not in ['.md', '.txt', '.cjs']: continue
        before = file.read_text()
        after = before
        for old, new in sorted(mapping.items(), key=lambda p: -len(p[0])): after = after.replace(old, new)
        if after != before:
            backup = ROOT / 'history/迁移前文档' / file.relative_to(ROOT)
            backup.parent.mkdir(parents=True, exist_ok=True)
            if not backup.exists(): backup.write_text(before)
            file.write_text(after)

(ROOT / 'migration-record.json').write_text(json.dumps({'timestamp': STAMP, 'moves': records, 'path_aliases': mapping, 'visible_messages': len(messages)}, ensure_ascii=False, indent=2))
print(json.dumps({'moved_groups': len(records), 'visible_messages': len(messages), 'canonical_sha256': digest(ROOT / '鸭鸭日历.html')}, ensure_ascii=False))
