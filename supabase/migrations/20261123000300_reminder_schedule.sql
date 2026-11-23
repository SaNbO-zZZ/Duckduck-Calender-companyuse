-- Install in one transaction so the new scheduler cannot race the existing Miaoda trigger.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
DO $$
DECLARE reminder_job bigint;
BEGIN
  IF coalesce(current_setting('cron.timezone', true),'GMT') NOT IN ('GMT','UTC','Etc/UTC') THEN
    RAISE EXCEPTION 'The 08:00 UTC reminder requires a UTC cron scheduler';
  END IF;
  SELECT cron.schedule('ducky-duty-reminder-1600', '0 8 * * *', $job$
    SELECT net.http_post(
      url := 'https://calendar.alphapulsex.online/api/cron/duty-reminder',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || decrypted_secret),
      body := '{}'::jsonb, timeout_milliseconds := 50000
    ) FROM vault.decrypted_secrets WHERE name = 'ducky_cron_secret' AND length(decrypted_secret) >= 32;
  $job$) INTO reminder_job;
  PERFORM cron.alter_job(reminder_job, active := false);
END;
$$;
