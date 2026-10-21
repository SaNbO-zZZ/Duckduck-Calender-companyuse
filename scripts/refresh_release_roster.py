#!/usr/bin/env python3
"""Verify all internal Feishu employees and stage one release's private DM roster.

Uses the operator's existing lark-cli user authorization. Prints only counts and a
digest; employee IDs are stored only in the Miaoda database, never in this repo.
"""

import argparse
import hashlib
import json
import re
import subprocess
import sys

APP_ID = 'app_17fstqsqv1c'


def cli(*args, input_text=None):
    result = subprocess.run(['lark-cli', *args, '--json'], input=input_text,
                            text=True, capture_output=True)
    try:
        body = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError('lark-cli did not return JSON') from error
    if result.returncode or not body.get('ok'):
        detail = body.get('error', {})
        raise RuntimeError(f"lark-cli failed: {detail.get('subtype', 'unknown')} {detail.get('message', '')}")
    return body['data']


def pages(path, params):
    token = None
    for _ in range(100):
        query = dict(params)
        if token:
            query['page_token'] = token
        data = cli('api', 'GET', path, '--as', 'user', '--params', json.dumps(query))
        if 'has_more' not in data:
            raise RuntimeError('directory pagination status missing')
        yield data.get('items') or []
        if not data['has_more']:
            return
        token = data.get('page_token')
        if not token:
            raise RuntimeError('directory pagination token missing')
    raise RuntimeError('directory exceeded 100 pages')


def company_open_ids():
    departments = ['0']
    seen_departments = set()
    members = set()
    while departments:
        department = departments.pop(0)
        if department in seen_departments:
            continue
        seen_departments.add(department)
        for batch in pages(f'/open-apis/contact/v3/departments/{department}/children',
                           {'department_id_type': 'department_id', 'page_size': 50}):
            for child in batch:
                child_id = child.get('department_id')
                if not child_id or child_id == department:
                    raise RuntimeError('invalid department entry')
                departments.append(child_id)
        for batch in pages('/open-apis/contact/v3/users/find_by_department',
                           {'department_id': department, 'department_id_type': 'department_id',
                            'user_id_type': 'open_id', 'page_size': 50}):
            for user in batch:
                open_id = user.get('open_id', '')
                if not re.fullmatch(r'ou_[0-9a-f]+', open_id):
                    raise RuntimeError('invalid employee open_id')
                members.add(open_id)
    if not members:
        raise RuntimeError('empty employee directory')
    return sorted(members), len(seen_departments)


def miaoda_ids(open_ids):
    converted = set()
    for index in range(0, len(open_ids), 100):
        batch = open_ids[index:index + 100]
        data = cli('apps', '+user-id-convert', '--as', 'user',
                   '--convert-type', 'open-id-to-miaoda', '--ids', ','.join(batch))
        if data.get('missed') or len(data.get('items', [])) != len(batch):
            raise RuntimeError('some employees could not be mapped to Miaoda users')
        for entry in data['items']:
            if entry.get('source_id') not in batch or not re.fullmatch(r'\d+', entry.get('target_id', '')):
                raise RuntimeError('invalid Miaoda ID mapping')
            converted.add(entry['target_id'])
    if len(converted) != len(open_ids):
        raise RuntimeError('duplicate Miaoda account mapping')
    return sorted(converted)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('version', help='published product version, e.g. v3.2.1')
    parser.add_argument('--apply', action='store_true', help='write verified roster to the online app database')
    args = parser.parse_args()
    if not re.fullmatch(r'v\d+\.\d+\.\d+', args.version):
        parser.error('invalid version')
    open_ids, department_count = company_open_ids()
    user_ids = miaoda_ids(open_ids)
    digest = hashlib.sha256(','.join(user_ids).encode()).hexdigest()[:12]
    print(f'version={args.version} departments={department_count} employees={len(user_ids)} digest={digest}')
    if not args.apply:
        print('Preview only. Use --apply after checking the count.')
        return
    # No IDs are printed. The transaction refuses to change a version after a
    # notification batch exists, preserving the audit trail.
    values = json.dumps(user_ids)
    sql = f"""BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM calendar_release_announcement WHERE version = '{args.version}') THEN
    RAISE EXCEPTION 'announcement already exists for this version';
  END IF;
END $$;
INSERT INTO calendar_release_roster (version, recipient_ids, recipient_count, verified_at, source)
VALUES ('{args.version}', '{values}'::jsonb, {len(user_ids)}, CURRENT_TIMESTAMP, 'feishu-contact-v3')
ON CONFLICT (version) DO UPDATE SET recipient_ids = EXCLUDED.recipient_ids,
  recipient_count = EXCLUDED.recipient_count, verified_at = EXCLUDED.verified_at,
  source = EXCLUDED.source;
COMMIT;"""
    cli('apps', '+db-execute', '--as', 'user', '--app-id', APP_ID,
        '--environment', 'online', '--sql', '-', '--yes', input_text=sql)
    print('Verified roster staged in the online app database.')


if __name__ == '__main__':
    try:
        main()
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)