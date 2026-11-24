-- psql -X -v ON_ERROR_STOP=1 -d <empty-local-test-db> -f tests/reminder-schedule.sql
-- The cron and network fixtures below are ordinary SQL, with no background workers.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL plpgsql.check_asserts = on;
CREATE SCHEMA cron;
CREATE SCHEMA net;
CREATE SCHEMA vault;
CREATE ROLE ducky_test_scheduler;
CREATE ROLE ducky_test_employee;
CREATE TABLE cron.job (jobid bigint PRIMARY KEY, jobname text, username text, schedule text, active boolean, command text);
CREATE FUNCTION cron.alter_job(job_id bigint, schedule text DEFAULT NULL, command text DEFAULT NULL,
  database text DEFAULT NULL, username text DEFAULT NULL, active boolean DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  UPDATE cron.job AS j SET command = coalesce($3, j.command), schedule = coalesce($2, j.schedule),
    username = coalesce($5, j.username), active = coalesce($6, j.active) WHERE jobid = $1;
$$;
INSERT INTO cron.job VALUES (42, 'ducky-duty-reminder-1600', 'ducky_test_scheduler', '0 8 * * *', false, 'old command');
CREATE TABLE vault.decrypted_secrets (name text, decrypted_secret text);
CREATE TABLE net.requests (id bigint GENERATED ALWAYS AS IDENTITY, method text, url text);
CREATE FUNCTION net.http_get(url text, params jsonb DEFAULT '{}', headers jsonb DEFAULT '{}', timeout_milliseconds int DEFAULT 2000)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  queued_id bigint;
BEGIN
  ASSERT headers->>'Authorization' = 'Bearer ' || repeat('x', 32);
  ASSERT timeout_milliseconds = 50000;
  INSERT INTO net.requests (method, url) VALUES ('GET', $1) RETURNING id INTO queued_id;
  RETURN queued_id;
END;
$$;
CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}', params jsonb DEFAULT '{}',
  headers jsonb DEFAULT '{}', timeout_milliseconds int DEFAULT 2000)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  queued_id bigint;
BEGIN
  ASSERT headers->>'Authorization' = 'Bearer ' || repeat('x', 32);
  ASSERT headers->>'Content-Type' = 'application/json' AND body = '{}'::jsonb AND timeout_milliseconds = 50000;
  INSERT INTO net.requests (method, url) VALUES ('POST', $1) RETURNING id INTO queued_id;
  IF current_setting('ducky_test.no_request_id', true) = 'on' THEN RETURN NULL; END IF;
  RETURN queued_id;
END;
$$;
GRANT USAGE ON SCHEMA net, vault TO ducky_test_scheduler;
GRANT SELECT ON vault.decrypted_secrets TO ducky_test_scheduler;
GRANT INSERT, SELECT ON net.requests TO ducky_test_scheduler;

SAVEPOINT before_upgrade;
\ir ../supabase/migrations/20261124001600_reminder_dispatch.sql
DO $$
BEGIN
  ASSERT (SELECT count(*) = 1 FROM cron.job);
  ASSERT (SELECT NOT active FROM cron.job WHERE jobid = 42);
  ASSERT (SELECT count(*) = 0 FROM net.requests);
END;
$$;
ROLLBACK TO before_upgrade;
UPDATE cron.job SET active = true, schedule = '5 8 * * *';
\ir ../supabase/migrations/20261124001600_reminder_dispatch.sql
DO $$
BEGIN
  ASSERT (SELECT count(*) = 1 FROM cron.job);
  ASSERT (SELECT active AND schedule = '5 8 * * *' AND username = 'ducky_test_scheduler' FROM cron.job WHERE jobid = 42);
  ASSERT (SELECT count(*) = 0 FROM net.requests);
  ASSERT NOT has_schema_privilege('ducky_test_employee', 'ducky_scheduler', 'USAGE');
  ASSERT NOT has_function_privilege('ducky_test_employee', 'ducky_scheduler.enqueue_reminder(boolean)', 'EXECUTE');
  ASSERT NOT has_table_privilege('ducky_test_employee', 'ducky_scheduler.reminder_requests', 'SELECT');
END;
$$;

DO $$
DECLARE
  bad_credential text;
BEGIN
  FOREACH bad_credential IN ARRAY ARRAY[NULL, '', 'short', repeat(' ', 32), repeat('x', 32) || chr(10)] LOOP
    DELETE FROM vault.decrypted_secrets;
    IF bad_credential IS NOT NULL THEN
      INSERT INTO vault.decrypted_secrets VALUES ('ducky_cron_secret', bad_credential);
    END IF;
    BEGIN
      PERFORM ducky_scheduler.enqueue_reminder(false);
      RAISE EXCEPTION 'Accepted an invalid credential';
    EXCEPTION WHEN invalid_parameter_value THEN
      ASSERT SQLERRM = 'Missing or invalid reminder credential in Vault';
    END;
  END LOOP;
  ASSERT (SELECT count(*) = 0 FROM net.requests);
  ASSERT (SELECT count(*) = 0 FROM ducky_scheduler.reminder_requests);
END;
$$;

UPDATE vault.decrypted_secrets SET decrypted_secret = repeat('x', 32);
SET LOCAL ducky_test.no_request_id = on;
DO $$
BEGIN
  BEGIN
    PERFORM ducky_scheduler.enqueue_reminder(false);
    RAISE EXCEPTION 'Accepted a missing request ID';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'pg_net returned no valid reminder request ID';
  END;
  ASSERT (SELECT count(*) = 0 FROM net.requests);
  ASSERT (SELECT count(*) = 0 FROM ducky_scheduler.reminder_requests);
END;
$$;
SET LOCAL ducky_test.no_request_id = off;
SELECT command AS installed_job_command FROM cron.job WHERE jobid = 42 \gset
SET LOCAL ROLE ducky_test_scheduler;
:installed_job_command;
SELECT ducky_scheduler.enqueue_reminder(true);
RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT count(*) = 2 FROM net.requests);
  ASSERT (SELECT count(*) = 2 FROM ducky_scheduler.reminder_requests);
  ASSERT (SELECT count(*) = 2 FROM net.requests n JOIN ducky_scheduler.reminder_requests r ON n.id = r.request_id
    WHERE n.url = 'https://calendar.alphapulsex.online/api/cron/duty-reminder' || CASE WHEN r.dry_run THEN '?dryRun=1' ELSE '' END
      AND n.method = CASE WHEN r.dry_run THEN 'GET' ELSE 'POST' END);
  ASSERT (SELECT count(*) = 1 FROM ducky_scheduler.reminder_requests WHERE dry_run);
END;
$$;
ROLLBACK;
