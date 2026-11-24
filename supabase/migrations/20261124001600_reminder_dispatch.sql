-- pg_net starts the request after commit. Keep its ID so operators can match
-- the enqueue time with net._http_response.id and the business delivery row.
CREATE SCHEMA ducky_scheduler;

CREATE TABLE ducky_scheduler.reminder_requests (
  request_id bigint NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  dry_run boolean NOT NULL
);

CREATE FUNCTION ducky_scheduler.enqueue_reminder(p_dry_run boolean)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  credential text;
  auth_headers jsonb;
  endpoint text := 'https://calendar.alphapulsex.online/api/cron/duty-reminder';
  queued_id bigint;
BEGIN
  IF p_dry_run IS NULL THEN
    RAISE EXCEPTION 'An explicit reminder mode is required';
  END IF;
  credential := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ducky_cron_secret');
  IF credential IS NULL OR length(credential) < 32 OR
     credential COLLATE "C" !~ '^[A-Za-z0-9._~+/-]+=*$' THEN
    RAISE EXCEPTION 'Missing or invalid reminder credential in Vault' USING ERRCODE = '22023';
  END IF;
  auth_headers := jsonb_build_object('Authorization', 'Bearer ' || credential);
  IF p_dry_run THEN
    queued_id := net.http_get(url := endpoint || '?dryRun=1', headers := auth_headers, timeout_milliseconds := 50000);
  ELSE
    queued_id := net.http_post(
      url := endpoint, headers := auth_headers || '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb, timeout_milliseconds := 50000
    );
  END IF;
  IF queued_id IS NULL OR queued_id < 1 THEN
    RAISE EXCEPTION 'pg_net returned no valid reminder request ID';
  END IF;
  INSERT INTO ducky_scheduler.reminder_requests (request_id, dry_run) VALUES (queued_id, p_dry_run);
  RETURN queued_id;
END;
$$;

REVOKE ALL ON SCHEMA ducky_scheduler FROM PUBLIC;
REVOKE ALL ON TABLE ducky_scheduler.reminder_requests FROM PUBLIC;
REVOKE ALL ON FUNCTION ducky_scheduler.enqueue_reminder(boolean) FROM PUBLIC;

DO $$
DECLARE
  job cron.job%ROWTYPE;
BEGIN
  SELECT * INTO STRICT job FROM cron.job WHERE jobname = 'ducky-duty-reminder-1600';
  EXECUTE format('GRANT USAGE ON SCHEMA ducky_scheduler TO %I', job.username);
  EXECUTE format('GRANT INSERT (request_id, dry_run) ON ducky_scheduler.reminder_requests TO %I', job.username);
  EXECUTE format('GRANT EXECUTE ON FUNCTION ducky_scheduler.enqueue_reminder(boolean) TO %I', job.username);
  PERFORM cron.alter_job(job.jobid, command := 'SELECT ducky_scheduler.enqueue_reminder(false)');
END;
$$;
