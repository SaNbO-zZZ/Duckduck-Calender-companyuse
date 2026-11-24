"""Build a private, offline Supabase → Miaoda review plan from a two-sided export."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from uuid import UUID

sys.dont_write_bytecode = True
from import_miaoda import PERSON_FIELDS, TABLES, load_snapshot, require

AUDIT = {'id', '_created_at', '_updated_at', '_created_by', '_updated_by'}
COLUMNS = {
    'calendar_submission': 'request_key applicant mentor hr kind leave_type start_ms end_ms submitted_ms payload_hash record_id record_state mentor_state hr_state',
    'calendar_release_announcement': 'version payload_hash expected_count status',
    'calendar_release_delivery': 'version recipient state',
    'calendar_release_roster': 'version recipient_ids recipient_count verified_at source',
    'duty_weekly_rule': 'weekday person_id duck_key valid_from valid_to status',
    'duty_avatar_binding': 'person_id duck_key manifest_version status',
    'duty_exchange_request': 'duty_date initiator_id invitee_id original_person_id replacement_person_id state _expires_at _confirmed_at',
    'duty_override': 'duty_date original_person_id replacement_person_id replacement_duck_key request_id status',
    'duty_notification_delivery': 'idempotency_key duty_date final_person_id state error_code attempt_count _accepted_at',
}
KEYS = {'calendar_submission': ('request_key',), 'calendar_release_announcement': ('version',),
        'calendar_release_delivery': ('version', 'recipient'), 'calendar_release_roster': ('version',),
        'duty_avatar_binding': ('person_open_id',), 'duty_notification_delivery': ('duty_date',)}


def canonical(row):
    result = row.copy()
    if result.get('base_status_synced') is None:
        result.pop('base_status_synced', None)  # Legacy receipts predate the Base mirror acknowledgement.
    for key, value in result.items():
        if key.endswith('_at') and value:
            iso = value.replace('Z', '+00:00')
            # Python 3.9 requires exactly three or six fractional digits.
            iso = re.sub(r'\.(\d{1,6})(?=[+-])', lambda m: '.' + m[1].ljust(6, '0'), iso)
            stamp = datetime.fromisoformat(iso)
            require(stamp.tzinfo is not None, 'Timestamp missing its timezone')
            result[key] = stamp.astimezone(timezone.utc).isoformat()
    return result


def index(rows):
    require(isinstance(rows, list), 'Invalid table export')
    by_id = {str(UUID(row['id'])): canonical(row) for row in rows}
    require(len(by_id) == len(rows), 'Duplicate id in table export')
    return by_id


def legacy_row(table, row, people):
    legacy = {}
    expected = AUDIT | set(COLUMNS[table].split())
    consumed = set()
    issues = []
    for field in sorted(expected):
        key = field[:-3] + '_open_id' if field in PERSON_FIELDS and field.endswith('_id') else field
        consumed.add(key)
        if key not in row:
            issues.append('missing_column:' + key)
            continue
        value = row[key]
        if field in PERSON_FIELDS and value is not None:
            require(value in people, 'unmapped_identity:' + field)
            value = '(' + people[value] + ')'
        if field == 'recipient_ids':
            require(isinstance(value, list) and len(set(value)) == len(value) == row['recipient_count'], 'invalid_roster')
            require(all(person in people for person in value), 'unmapped_identity:recipient_ids')
            value = [people[person] for person in value]
        if field == 'idempotency_key':
            person = row['final_person_open_id']
            require(value == row['duty_date'] + ':' + person, 'inconsistent_reminder_key')
            require(person in people, 'unmapped_identity:final_person_id')
            value = row['duty_date'] + ':' + people[person]
        legacy[field] = value
    extra = sorted(set(row) - consumed)
    if extra:
        issues.append('preserve_target_only_columns:' + ','.join(extra))
    return legacy, issues


def row_checks(table, row, target):
    if table == 'calendar_submission':
        checks = ['verify_existing_base_record_and_request_key', 'preserve_original_payload_hash_and_verify_legacy_replay']
        if not row.get('record_id') or row.get('record_state') != 'created' or any(row.get(k) != 'sent' for k in ('mentor_state', 'hr_state')):
            checks.append('uncertain_registration_or_delivery')
        return checks
    if table == 'duty_notification_delivery':
        return ['verify_accepted_message_and_day_dedup' if row.get('state') == 'accepted' and row.get('_accepted_at') else 'uncertain_reminder_delivery']
    if table == 'calendar_release_delivery':
        return ['verify_accepted_message' if row.get('state') == 'accepted' else 'uncertain_notice_delivery']
    if table == 'calendar_release_announcement' and row.get('status') != 'accepted':
        return ['uncertain_notice_batch']
    if table in ('duty_exchange_request', 'duty_override'):
        if table == 'duty_override':
            request = target['duty_exchange_request'].get(row.get('request_id'))
            overrides = [row]
        else:
            request = row
            overrides = [r for r in target['duty_override'].values() if r.get('request_id') == request['id'] and r.get('status') == 'active']
        checks = ['review_exchange_state_and_delivery_receipts']
        if table == 'duty_override' or request.get('state') in ('confirmed', 'applied'):
            if (not request or request['state'] != 'applied' or len(overrides) != 1 or
                    any(request.get(k) != overrides[0].get(k) for k in ('duty_date','original_person_open_id','replacement_person_open_id'))):
                checks.append('exchange_override_pair_inconsistent')
            else:
                checks.append('verify_paired_request_and_override_in_one_transaction')
        if request and any(request.get(k) in ('sending','needs_review') for k in ('invite_delivery','decision_delivery')):
            checks.append('uncertain_exchange_delivery')
        return checks
    return []


def build_plan(root):
    normalized = load_snapshot(root)
    mapping = json.loads((root / 'person-id-map.json').read_bytes())
    people = {p['feishu_open_id']: str(p['miaoda_user_id']) for p in mapping['people']}
    require(all(re.fullmatch(r'\d{1,24}', value) for value in people.values()), 'Invalid Miaoda identity map')
    current = {t: index(normalized[t]) for t in TABLES}
    target, fingerprints = {}, {}
    for table in TABLES:
        data = (root / 'target' / (table + '.json')).read_bytes()
        target[table] = index(json.loads(data))
        fingerprints[table] = {'old_count': len(current[table]), 'old_sha256': mapping['source_sha256'][table],
                               'target_count': len(target[table]), 'target_sha256': hashlib.sha256(data).hexdigest()}
    changes = []
    for table in TABLES:
        old, new = current[table], target[table]
        for key in sorted(old.keys() | new.keys()):
            before, after = old.get(key), new.get(key)
            if before == after:
                continue
            item = {'table': table, 'id': key, 'old_as_target': before, 'target': after}
            if not after:
                item.update(kind='old_only', checks=['preserve_old_row_and_investigate'])
            else:
                checks = row_checks(table, after, target)
                item.update(kind='same_id_changed' if before else 'target_only')
                if before:
                    checks.append('manual_merge_same_id')
                natural = KEYS.get(table, ())
                if table == 'duty_override' and after.get('status') == 'active':
                    natural = ('duty_date','status')
                if natural and any(r['id'] != key and all(r.get(k) == after.get(k) for k in natural) for r in old.values()):
                    checks.append('conflicting_legacy_business_key')
                try:
                    proposed, column_checks = legacy_row(table, after, people)
                    item['legacy_projection'] = proposed
                    checks.extend(column_checks)
                except ValueError as error:
                    checks.append(str(error))
                item['checks'] = checks
            changes.append(item)
    return {'format': 1, 'may_reopen_legacy': False, 'scope': list(TABLES), 'exports': fingerprints,
            'required_before_reopening': [
                'freeze_target_writes_and_both_schedulers_verify_old_seal_and_independent_full_export_counts',
                'preserve_full_target_backup_including_new_only_tables_and_message_receipts',
                'resolve_each_row_check_and_confirm_existing_base_ids_never_recreate_base_or_replay_messages',
                'approve_exact_diff_then_restore_legacy_database_only_in_one_operator_transaction_with_admission_closed',
                'reexport_and_compare_business_keys_receipts_ids_and_exchange_pairs_verify_actual_legacy_replay_without_sends',
                'obtain_separate_approval_for_legacy_writes_and_single_scheduler'], 'changes': changes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('snapshot', type=Path, help='directory containing online/, target/ and verified identity map')
    parser.add_argument('output', type=Path, help='new private JSON file under tmp-migration-backup/')
    args = parser.parse_args()
    private = (Path(__file__).resolve().parents[1] / 'tmp-migration-backup').resolve()
    require(args.output.resolve().is_relative_to(private), 'Private output required')
    plan = build_plan(args.snapshot)
    payload = json.dumps(plan, ensure_ascii=False, indent=2).encode()
    # Exclusive creation works on the removable volume without hard-link support.
    # The plan has no execution mode. A truncated JSON file is never usable.
    descriptor = os.open(args.output, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        with os.fdopen(descriptor, 'wb') as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
    except BaseException:
        args.output.unlink()
        raise
    print('Private offline review plan created. Differences:', len(plan['changes']))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError) as error:
        # Input rows may contain employee information. Report the class only.
        print('Invalid or unavailable snapshot, private destination or identity map:', type(error).__name__, file=sys.stderr)
        sys.exit(1)
