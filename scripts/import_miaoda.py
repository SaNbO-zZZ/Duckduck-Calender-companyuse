"""Import the verified Phase 0 online snapshot using PostgreSQL or Supabase REST."""
import argparse
import base64
import hashlib
import tempfile
import json
import os
from pathlib import Path
import re
import subprocess
import sys

TABLES = (
    "calendar_submission", "calendar_release_announcement", "calendar_release_delivery",
    "calendar_release_roster", "duty_weekly_rule", "duty_avatar_binding",
    "duty_exchange_request", "duty_override", "duty_notification_delivery",
)
PERSON_FIELDS = {
    "_created_by", "_updated_by", "applicant", "mentor", "hr", "recipient", "person_id",
    "original_person_id", "replacement_person_id", "initiator_id", "invitee_id", "final_person_id",
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def load_snapshot(root):
    mapping = json.loads((root / "person-id-map.json").read_bytes())
    require(mapping["feishu_app_id"] == "cli_aa35caedff78dcc5" and
            mapping["source_environment"] == "online", "Incorrect source app or environment")
    people = mapping["people"]
    users = {str(p["miaoda_user_id"]): p["feishu_open_id"] for p in people}
    require(len(users) == len(set(users.values())) == len(people) and people,
            "Expected a non-empty, one-to-one identity map")
    require(all(re.fullmatch(r"ou_[A-Za-z0-9]+", v) for v in users.values()), "Invalid open_id")
    result = {"feishu_users": [
        {"open_id": p["feishu_open_id"], "name": p["name"] or None,
         "union_id": p["feishu_union_id"] or None} for p in people
    ]}
    verification = json.loads((root / "online-count-verification.json").read_bytes())
    require(verification["ok"], "Source counts not verified")
    counts = {r["table_name"]: r["row_count"] for r in verification["data"]}

    def resolve(value):
        if value is None:
            return None
        key = str(value).removeprefix("(").removesuffix(")")
        require(key in users, "Unmapped identity in verified snapshot")
        return users[key]

    for table in TABLES:
        raw = (root / "online" / (table + ".json")).read_bytes()
        require(hashlib.sha256(raw).hexdigest() == mapping["source_sha256"][table],
                "Snapshot checksum mismatch: " + table)
        rows = json.loads(raw)
        require(len(rows) == counts[table], "Source count mismatch: " + table)
        for row in rows:
            if table == "duty_exchange_request":
                row.update(invite_delivery="pending", decision_delivery="pending")
            if table == "duty_notification_delivery":
                date, recipient = row["idempotency_key"].split(":")
                require(date == row["duty_date"] and resolve(recipient) == resolve(row["final_person_id"]),
                        "Inconsistent reminder identity")
                row["idempotency_key"] = date + ":" + resolve(recipient)
            if table == "calendar_release_roster":
                recipients = row["recipient_ids"]
                if isinstance(recipients, str):
                    recipients = json.loads(recipients)
                ids = [resolve(value) for value in recipients]
                require(len(set(ids)) == len(ids) == row["recipient_count"] and None not in ids,
                        "Inconsistent release roster")
                row["recipient_ids"] = ids
            for field in PERSON_FIELDS.intersection(row):
                column = field.removesuffix("_id") + "_open_id" if field.endswith("_id") else field
                row[column] = resolve(row.pop(field))
        result[table] = rows
    return result


def import_snapshot(snapshot, rest):
    raw = json.dumps(snapshot, ensure_ascii=False).encode()
    if rest:
        origin = os.environ.get("SUPABASE_URL", "").rstrip("/")
        require(re.fullmatch(r"https://[a-z0-9]+\.supabase\.co", origin), "Invalid Supabase project URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        require(key, "Missing Supabase server key")
        require(re.fullmatch(r"[a-zA-Z0-9._-]+", key), "Invalid Supabase server key")
        # Read secrets from stdin and keep the request body in a mode-0600 temporary file.
        config = 'header = "apikey: ' + key + '"\n'
        if not key.startswith("sb_secret_"):
            config += 'header = "Authorization: Bearer ' + key + '"\n'
        with tempfile.NamedTemporaryFile() as payload:
            payload.write(b'{"snapshot":' + raw + b'}')
            payload.flush()
            run = subprocess.run(["curl", "-q", "--config", "-", "--silent", "--max-time", "60",
                                  "--header", "Content-Type: application/json", "--data-binary", "@" + payload.name,
                                  "--output", os.devnull, "--write-out", "%{http_code}",
                                  origin + "/rest/v1/rpc/import_miaoda_snapshot"],
                                 input=config, text=True, capture_output=True)
        require(run.returncode == 0 and run.stdout in ("200", "204"),
                "Import RPC failed, HTTP " + run.stdout + ", curl exit " + str(run.returncode))
        return
    target = os.environ.get("DATABASE_URL")
    require(target, "Set DATABASE_URL for the intended destination, or use --rest")
    payload = base64.b64encode(raw).decode("ascii")
    statement = ("SELECT public.import_miaoda_snapshot(convert_from(decode('" + payload +
                 "', 'base64'), 'UTF8')::jsonb);")
    run = subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate"],
                         input=statement, text=True, capture_output=True,
                         env={**os.environ, "PGDATABASE": target})
    if run.returncode:
        codes = re.findall(r"(?:ERROR|FATAL):\s+([A-Z0-9]{5})\b", run.stderr)
        raise ValueError("Import failed; check destination, schema and conflicts. SQLSTATE " +
                         ", ".join(codes or ["unavailable"]))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup", type=Path, default=Path("tmp-migration-backup"))
    parser.add_argument("--rest", action="store_true", help="Use service-role PostgREST instead of DATABASE_URL")
    args = parser.parse_args()
    try:
        data = load_snapshot(args.backup)
        import_snapshot(data, args.rest)
    except (ValueError, KeyError, TypeError, OSError) as error:
        # Keep database errors and snapshot contents out of operator logs.
        print(str(error) if type(error) is ValueError else "Invalid snapshot or unavailable client", file=sys.stderr)
        sys.exit(1)
    for name, records in data.items():
        print(f"{name}: {len(records)} verified")
