"""Offline, synthetic rollback-plan regression cases (no database or Feishu connection)."""
from pathlib import Path
import hashlib
import json
import sys
import tempfile
import unittest
from uuid import UUID

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from plan_miaoda_rollback import AUDIT, COLUMNS, TABLES, build_plan, legacy_row
from import_miaoda import PERSON_FIELDS, load_snapshot


def uid(n):
    return str(UUID(int=n))


DATE = '2026-11-25'
STAMP = DATE + 'T16:00:00.45+08:00'
PEOPLE = {'ou_A': '11', 'ou_B': '22'}


def row(table, n, **fields):
    out = {}
    for field in AUDIT | set(COLUMNS[table].split()):
        key = field[:-3] + '_open_id' if field in PERSON_FIELDS and field.endswith('_id') else field
        out[key] = 'ou_A' if field in PERSON_FIELDS else STAMP if field.endswith('_at') else None
    return {**out, 'id': uid(n), **fields}


def checkpoint(root, source, target):
    (root/'online').mkdir(exist_ok=True)
    (root/'target').mkdir(exist_ok=True)
    hashes, counts = {}, []
    for table in TABLES:
        raw = json.dumps(source.get(table, [])).encode()
        (root/'online'/(table+'.json')).write_bytes(raw)
        hashes[table] = hashlib.sha256(raw).hexdigest()
        counts.append({'table_name': table, 'row_count': len(source.get(table, []))})
        (root/'target'/(table+'.json')).write_text(json.dumps(target.get(table, [])))
    (root/'online-count-verification.json').write_text(json.dumps({'ok': True, 'data': counts}))
    (root/'person-id-map.json').write_text(json.dumps({'feishu_app_id': 'cli_aa35caedff78dcc5',
        'source_environment':'online', 'source_sha256': hashes, 'people': [
            {'miaoda_user_id': old, 'feishu_open_id': new, 'feishu_union_id': None, 'name': None} for new,old in PEOPLE.items()]}))


class RollbackPlanTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)

    def test_new_registration_applied_exchange_and_accepted_reminder_keep_ids_and_receipts(self):
        new = {
            'calendar_submission':[row('calendar_submission', 1, request_key=uid(11), record_id='recExisting',
                kind='leave', mentor='ou_B', record_state='created', mentor_state='sent', hr_state='sent', payload_hash='preserved')],
            'duty_exchange_request':[row('duty_exchange_request', 2, duty_date=DATE, state='applied', invitee_open_id='ou_B',
                replacement_person_open_id='ou_B', invite_delivery='sent', decision_delivery='sent')],
            'duty_override':[row('duty_override', 3, request_id=uid(2), duty_date=DATE,
                replacement_person_open_id='ou_B', status='active')],
            'duty_notification_delivery':[row('duty_notification_delivery', 4, state='accepted',
                duty_date=DATE, final_person_open_id='ou_B', idempotency_key=DATE+':ou_B', attempt_count=1)]}
        checkpoint(self.root, {}, new)
        result = build_plan(self.root)
        self.assertFalse(result['may_reopen_legacy'])
        changes = {r['table']: r for r in result['changes']}
        old = {t: [r['legacy_projection']] for t,r in changes.items()}
        register = old['calendar_submission'][0]
        self.assertEqual((register['record_id'], register['request_key'], register['mentor'], register['payload_hash']),
                         ('recExisting', uid(11), '(22)', 'preserved'))
        reminder = old['duty_notification_delivery'][0]
        self.assertEqual((reminder['idempotency_key'], reminder['state']), (DATE+':22','accepted'))
        self.assertIn('verify_paired_request_and_override_in_one_transaction', changes['duty_override']['checks'])
        self.assertNotIn('decision_delivery', old['duty_exchange_request'][0])
        self.assertEqual(changes['duty_exchange_request']['target']['decision_delivery'], 'sent')
        # Simulate a reviewed database-only restoration to the old export. The
        # real forward mapper must recover the registration, override and dedup receipt.
        checkpoint(self.root, old, new)
        roundtrip = load_snapshot(self.root)
        self.assertEqual(roundtrip['duty_override'][0]['request_id'], uid(2))
        self.assertEqual(roundtrip['duty_notification_delivery'][0]['idempotency_key'], DATE+':ou_B')
        remaining = build_plan(self.root)['changes']
        self.assertEqual([(r['table'],r['kind']) for r in remaining], [('duty_exchange_request','same_id_changed')])
        self.assertTrue(any('preserve_target_only_columns' in reason for reason in remaining[0]['checks']))

    def test_ambiguous_unmapped_same_key_and_legacy_only_are_separate(self):
        initial = row('calendar_submission', 1, request_key=uid(21), record_state='created', record_id='recExisting',
                      mentor_state='sent', hr_state='sent')
        changed = {**initial, 'hr_state':'pending_review'}
        conflict = {**changed, 'id':uid(2), 'applicant':'ou_Unmapped'}
        old = {'calendar_submission':[legacy_row('calendar_submission', initial, PEOPLE)[0]],
               'duty_weekly_rule':[legacy_row('duty_weekly_rule', row('duty_weekly_rule', 3), PEOPLE)[0]]}
        new = {'calendar_submission':[changed, conflict],
               'duty_notification_delivery':[row('duty_notification_delivery', 4, duty_date=DATE,
                    state='pending', idempotency_key=DATE+':ou_A')],
               'duty_override':[row('duty_override', 5, request_id=uid(90), status='active', duty_date=DATE)]}
        checkpoint(self.root, old, new)
        plan = build_plan(self.root)
        changes = {r['id']:r for r in plan['changes']}
        self.assertIn('manual_merge_same_id', changes[uid(1)]['checks'])
        self.assertIn('uncertain_registration_or_delivery', changes[uid(1)]['checks'])
        self.assertIn('conflicting_legacy_business_key', changes[uid(2)]['checks'])
        self.assertIn('unmapped_identity:applicant', changes[uid(2)]['checks'])
        self.assertNotIn('legacy_projection', changes[uid(2)])
        self.assertEqual(changes[uid(3)]['kind'], 'old_only')
        self.assertIn('uncertain_reminder_delivery', changes[uid(4)]['checks'])
        self.assertIn('exchange_override_pair_inconsistent', changes[uid(5)]['checks'])

    def test_missing_export_and_source_tampering_abort(self):
        checkpoint(self.root, {}, {})
        (self.root/'target/calendar_submission.json').unlink()
        with self.assertRaises(FileNotFoundError):
            build_plan(self.root)
        checkpoint(self.root, {}, {})
        (self.root/'online/calendar_submission.json').write_text('[{}]')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            build_plan(self.root)


if __name__ == '__main__':
    unittest.main()
