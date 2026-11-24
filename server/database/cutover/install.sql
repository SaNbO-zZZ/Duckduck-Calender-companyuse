-- Apply in the Miaoda dev workspace. Review the platform schema promotion for all objects before releasing the old server.
-- Re-running this transaction preserves the admission state and outstanding tickets.
-- Schema promotion may omit data. Verify the destination objects and run initialize.sql in that workspace.
BEGIN;
CREATE TABLE IF NOT EXISTS ducky_legacy_gate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL UNIQUE DEFAULT true CHECK (singleton),
  mode text NOT NULL CHECK (mode IN ('open', 'draining', 'sealed')),
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_by user_profile
);
INSERT INTO ducky_legacy_gate (singleton, mode) VALUES (true, 'open')
ON CONFLICT (singleton) DO NOTHING;
CREATE TABLE IF NOT EXISTS ducky_legacy_work (
  id uuid PRIMARY KEY,
  operation text NOT NULL,
  reference text,
  state text NOT NULL DEFAULT 'running' CHECK (state IN ('running','needs_review')),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_by user_profile
);

-- Only the backend service role may change admission or reconcile tickets.
ALTER TABLE ducky_legacy_gate ENABLE ROW LEVEL SECURITY;
ALTER TABLE ducky_legacy_work ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ducky_service_only ON ducky_legacy_gate;
CREATE POLICY ducky_service_only ON ducky_legacy_gate TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS ducky_deny_members_select ON ducky_legacy_gate;
CREATE POLICY ducky_deny_members_select ON ducky_legacy_gate FOR SELECT TO authenticated, anon USING (false);
DROP POLICY IF EXISTS ducky_deny_members_insert ON ducky_legacy_gate;
CREATE POLICY ducky_deny_members_insert ON ducky_legacy_gate FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS ducky_deny_members_update ON ducky_legacy_gate;
CREATE POLICY ducky_deny_members_update ON ducky_legacy_gate FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS ducky_service_only ON ducky_legacy_work;
CREATE POLICY ducky_service_only ON ducky_legacy_work TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS ducky_deny_members_select ON ducky_legacy_work;
CREATE POLICY ducky_deny_members_select ON ducky_legacy_work FOR SELECT TO authenticated, anon USING (false);
DROP POLICY IF EXISTS ducky_deny_members_insert ON ducky_legacy_work;
CREATE POLICY ducky_deny_members_insert ON ducky_legacy_work FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS ducky_deny_members_update ON ducky_legacy_work;
CREATE POLICY ducky_deny_members_update ON ducky_legacy_work FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

-- This shared row lock serializes admission with the operator's mode change.
-- The durable ticket outlives a lost application process or DB connection.
CREATE OR REPLACE FUNCTION ducky_legacy_admit(ticket uuid, operation_name text, work_reference text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM ducky_legacy_gate WHERE singleton AND mode = 'open' FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO ducky_legacy_work(id, operation, reference) VALUES (ticket, operation_name, work_reference);
  RETURN true;
END;
$$;

-- Existing tickets may finish writes while draining. The final seal also fences
-- direct SQL and uninstrumented writers to each old business table.
CREATE OR REPLACE FUNCTION ducky_check_legacy_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed boolean;
BEGIN
  EXECUTE format('SELECT true FROM %I.ducky_legacy_gate WHERE singleton AND mode IN (''open'',''draining'') FOR SHARE', TG_TABLE_SCHEMA) INTO allowed;
  IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Legacy business writes are sealed' USING ERRCODE = '55000'; END IF;
  RETURN NULL;
END;
$$;
CREATE OR REPLACE TRIGGER ducky_legacy_write_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON calendar_submission
  FOR EACH STATEMENT EXECUTE FUNCTION ducky_check_legacy_write();
CREATE OR REPLACE TRIGGER ducky_legacy_write_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON calendar_release_announcement
  FOR EACH STATEMENT EXECUTE FUNCTION ducky_check_legacy_write();
CREATE OR REPLACE TRIGGER ducky_legacy_write_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON calendar_release_delivery
  FOR EACH STATEMENT EXECUTE FUNCTION ducky_check_legacy_write();
CREATE OR REPLACE TRIGGER ducky_legacy_write_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON calendar_release_roster
  FOR EACH STATEMENT EXECUTE FUNCTION ducky_check_legacy_write();
CREATE OR REPLACE TRIGGER ducky_legacy_write_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON duty_weekly_rule
  FOR EACH STATEMENT EXECUTE FUNCTION ducky_check_legacy_write();
CREATE OR REPLACE TRIGGER ducky_legacy_write_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON duty_avatar_binding
  FOR EACH STATEMENT EXECUTE FUNCTION ducky_check_legacy_write();
CREATE OR REPLACE TRIGGER ducky_legacy_write_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON duty_exchange_request
  FOR EACH STATEMENT EXECUTE FUNCTION ducky_check_legacy_write();
CREATE OR REPLACE TRIGGER ducky_legacy_write_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON duty_override
  FOR EACH STATEMENT EXECUTE FUNCTION ducky_check_legacy_write();
CREATE OR REPLACE TRIGGER ducky_legacy_write_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON duty_notification_delivery
  FOR EACH STATEMENT EXECUTE FUNCTION ducky_check_legacy_write();

CREATE OR REPLACE FUNCTION ducky_legacy_seal()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM ducky_legacy_gate WHERE singleton AND mode IN ('draining','sealed') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Close admission before sealing'; END IF;
  IF EXISTS (SELECT FROM ducky_legacy_work) THEN RAISE EXCEPTION 'Outstanding legacy work'; END IF;
  UPDATE ducky_legacy_gate SET mode = 'sealed' WHERE singleton;
END;
$$;
COMMIT;
