-- Run once through the Supabase migration runner or psql --single-transaction.
SET LOCAL search_path = public, pg_catalog;

CREATE TABLE feishu_users (
  open_id text PRIMARY KEY CHECK (open_id ~ '^ou_[a-zA-Z0-9]+$'),
  union_id text,
  name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  is_active boolean NOT NULL DEFAULT true,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE calendar_submission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key uuid NOT NULL UNIQUE,
  applicant text REFERENCES feishu_users(open_id) NOT NULL,
  mentor text REFERENCES feishu_users(open_id) NOT NULL,
  hr text REFERENCES feishu_users(open_id) NOT NULL,
  kind varchar(12) NOT NULL,
  leave_type varchar(30) NOT NULL DEFAULT '',
  start_ms bigint NOT NULL,
  end_ms bigint NOT NULL,
  submitted_ms bigint NOT NULL,
  payload_hash varchar(64) NOT NULL,
  record_id varchar(80),
  record_state varchar(24) NOT NULL DEFAULT 'creating',
  mentor_state varchar(24) NOT NULL DEFAULT 'pending',
  hr_state varchar(24) NOT NULL DEFAULT 'pending',
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by text REFERENCES feishu_users(open_id),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by text REFERENCES feishu_users(open_id)
);

CREATE TABLE calendar_release_announcement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version varchar(32) NOT NULL UNIQUE,
  payload_hash varchar(64) NOT NULL,
  expected_count integer NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'sending',
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by text REFERENCES feishu_users(open_id),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by text REFERENCES feishu_users(open_id)
);

CREATE TABLE calendar_release_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version varchar(32) NOT NULL REFERENCES calendar_release_announcement(version),
  recipient text REFERENCES feishu_users(open_id) NOT NULL,
  state varchar(24) NOT NULL DEFAULT 'pending',
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by text REFERENCES feishu_users(open_id),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by text REFERENCES feishu_users(open_id),
  CONSTRAINT calendar_release_delivery_version_recipient_key UNIQUE (version, recipient)
);

CREATE TABLE calendar_release_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version varchar(32) NOT NULL UNIQUE,
  recipient_ids jsonb NOT NULL,
  recipient_count integer NOT NULL CHECK (recipient_count > 0),
  verified_at TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  source varchar(80) NOT NULL,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by text REFERENCES feishu_users(open_id),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by text REFERENCES feishu_users(open_id)
);

CREATE TABLE duty_weekly_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday integer NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  person_open_id text REFERENCES feishu_users(open_id) NOT NULL,
  duck_key varchar(40) NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  status varchar(16) NOT NULL DEFAULT 'active',
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by text REFERENCES feishu_users(open_id),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by text REFERENCES feishu_users(open_id)
);

CREATE TABLE duty_override (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_date date NOT NULL,
  original_person_open_id text REFERENCES feishu_users(open_id) NOT NULL,
  replacement_person_open_id text REFERENCES feishu_users(open_id) NOT NULL,
  replacement_duck_key varchar(40),
  request_id uuid,
  status varchar(16) NOT NULL DEFAULT 'active',
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by text REFERENCES feishu_users(open_id),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by text REFERENCES feishu_users(open_id)
);

CREATE UNIQUE INDEX duty_override_date_active_key ON duty_override(duty_date) WHERE status = 'active';

CREATE TABLE duty_avatar_binding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_open_id text REFERENCES feishu_users(open_id) NOT NULL,
  duck_key varchar(40) NOT NULL,
  manifest_version varchar(40) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active',
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by text REFERENCES feishu_users(open_id),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by text REFERENCES feishu_users(open_id)
);

CREATE UNIQUE INDEX duty_avatar_binding_person_key ON duty_avatar_binding(person_open_id);

CREATE TABLE duty_exchange_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_date date NOT NULL,
  initiator_open_id text REFERENCES feishu_users(open_id) NOT NULL,
  invitee_open_id text REFERENCES feishu_users(open_id) NOT NULL,
  original_person_open_id text REFERENCES feishu_users(open_id) NOT NULL,
  replacement_person_open_id text REFERENCES feishu_users(open_id) NOT NULL,
  state varchar(32) NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','awaiting_confirmation','confirmed','applied','rejected','cancelled','expired')),
  _expires_at TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  _confirmed_at TIMESTAMP(3) WITH TIME ZONE,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by text REFERENCES feishu_users(open_id),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by text REFERENCES feishu_users(open_id)
);

CREATE INDEX duty_exchange_request_date_idx ON duty_exchange_request(duty_date);

CREATE TABLE duty_notification_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key varchar(160) NOT NULL,
  duty_date date NOT NULL,
  final_person_open_id text REFERENCES feishu_users(open_id) NOT NULL,
  state varchar(24) NOT NULL DEFAULT 'pending',
  error_code varchar(120),
  attempt_count integer NOT NULL DEFAULT 0,
  _accepted_at TIMESTAMP(3) WITH TIME ZONE,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by text REFERENCES feishu_users(open_id),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by text REFERENCES feishu_users(open_id)
);

CREATE UNIQUE INDEX duty_notification_delivery_idempotency_key ON duty_notification_delivery(idempotency_key);

ALTER TABLE duty_override ADD FOREIGN KEY (request_id) REFERENCES duty_exchange_request(id);

CREATE TABLE company_charter_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  category text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  markdown_content text NOT NULL,
  duck_sticker_id text CHECK (duck_sticker_id ~ '^(0[1-9]|1[0-9]|2[0-4])$'),
  sort_order integer NOT NULL DEFAULT 0,
  version text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  source_wiki_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text REFERENCES feishu_users(open_id)
);

CREATE TABLE charter_acknowledgements (
  user_open_id text NOT NULL REFERENCES feishu_users(open_id),
  charter_version text NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_open_id, charter_version)
);

CREATE TABLE festival_themes (
  key text PRIMARY KEY,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  start_date date,
  end_date date,
  recurrence text NOT NULL CHECK (recurrence IN ('solar', 'lunar_table')),
  palette_json jsonb NOT NULL DEFAULT '{}',
  particle_config_json jsonb NOT NULL DEFAULT '{}',
  asset_pack text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

ALTER TABLE feishu_users ENABLE ROW LEVEL SECURITY;

ALTER TABLE calendar_submission ENABLE ROW LEVEL SECURITY;

ALTER TABLE calendar_release_announcement ENABLE ROW LEVEL SECURITY;

ALTER TABLE calendar_release_delivery ENABLE ROW LEVEL SECURITY;

ALTER TABLE calendar_release_roster ENABLE ROW LEVEL SECURITY;

ALTER TABLE duty_weekly_rule ENABLE ROW LEVEL SECURITY;

ALTER TABLE duty_override ENABLE ROW LEVEL SECURITY;

ALTER TABLE duty_avatar_binding ENABLE ROW LEVEL SECURITY;

ALTER TABLE duty_exchange_request ENABLE ROW LEVEL SECURITY;

ALTER TABLE duty_notification_delivery ENABLE ROW LEVEL SECURITY;

ALTER TABLE company_charter_docs ENABLE ROW LEVEL SECURITY;

ALTER TABLE charter_acknowledgements ENABLE ROW LEVEL SECURITY;

ALTER TABLE festival_themes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  feishu_users,
  calendar_submission,
  calendar_release_announcement,
  calendar_release_delivery,
  calendar_release_roster,
  duty_weekly_rule,
  duty_override,
  duty_avatar_binding,
  duty_exchange_request,
  duty_notification_delivery,
  company_charter_docs,
  charter_acknowledgements,
  festival_themes
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  feishu_users,
  calendar_submission,
  calendar_release_announcement,
  calendar_release_delivery,
  calendar_release_roster,
  duty_weekly_rule,
  duty_override,
  duty_avatar_binding,
  duty_exchange_request,
  duty_notification_delivery,
  company_charter_docs,
  charter_acknowledgements,
  festival_themes
TO service_role;

-- Only the OAuth backend may refresh a directory entry. Preserve admin and disabled flags.
CREATE FUNCTION public.sync_feishu_login(p_open_id text, p_union_id text, p_name text, p_avatar_url text)
RETURNS TABLE (open_id text, name text, avatar_url text, role text)
LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
  INSERT INTO public.feishu_users AS u (open_id, union_id, name, avatar_url)
  VALUES (p_open_id, p_union_id, p_name, p_avatar_url)
  ON CONFLICT ON CONSTRAINT feishu_users_pkey DO UPDATE
    SET union_id = coalesce(excluded.union_id, u.union_id),
        name = excluded.name, avatar_url = excluded.avatar_url, synced_at = now()
    WHERE u.is_active
  RETURNING u.open_id, u.name, u.avatar_url, u.role;
$$;
REVOKE ALL ON FUNCTION public.sync_feishu_login(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_feishu_login(text, text, text, text) TO service_role;

-- The operator can submit the snapshot in one transaction over PostgREST or psql.
CREATE FUNCTION public.import_miaoda_snapshot(snapshot jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  target text;
  batch jsonb;
  differs boolean;
BEGIN
  LOCK TABLE public.feishu_users IN SHARE ROW EXCLUSIVE MODE;
  INSERT INTO public.feishu_users (open_id, name, union_id)
    SELECT p.open_id, p.name, p.union_id FROM jsonb_to_recordset(snapshot->'feishu_users')
      AS p(open_id text, name text, union_id text)
    ON CONFLICT (open_id) DO NOTHING;

  FOREACH target IN ARRAY ARRAY[
    'calendar_submission', 'calendar_release_announcement', 'calendar_release_delivery',
    'calendar_release_roster', 'duty_weekly_rule', 'duty_avatar_binding',
    'duty_exchange_request', 'duty_override', 'duty_notification_delivery'
  ] LOOP
    batch := snapshot->target;
    IF jsonb_typeof(batch) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Missing batch for %', target;
    END IF;
    EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE', target);
    EXECUTE format('INSERT INTO public.%1$I SELECT * FROM jsonb_populate_recordset(NULL::public.%1$I, $1)
                    ON CONFLICT (id) DO NOTHING', target) USING batch;
    EXECUTE format('SELECT EXISTS (SELECT * FROM jsonb_populate_recordset(NULL::public.%1$I, $1)
                    EXCEPT SELECT * FROM public.%1$I)', target) INTO differs USING batch;
    IF differs THEN RAISE EXCEPTION 'Snapshot conflict in %', target; END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.import_miaoda_snapshot(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_miaoda_snapshot(jsonb) TO service_role;
