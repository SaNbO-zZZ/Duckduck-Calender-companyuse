-- Provision in the *old Miaoda database* before publishing the guarded old server.
-- Re-running this transaction preserves the admission state and outstanding tickets.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ducky_legacy_gate (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  mode text NOT NULL CHECK (mode IN ('open', 'draining', 'sealed'))
);
INSERT INTO public.ducky_legacy_gate (singleton, mode) VALUES (true, 'open')
ON CONFLICT (singleton) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.ducky_legacy_work (
  id uuid PRIMARY KEY,
  operation text NOT NULL,
  reference text,
  state text NOT NULL DEFAULT 'running' CHECK (state IN ('running','needs_review')),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- This shared row lock serializes admission with the operator's mode change.
-- The durable ticket outlives a lost application process or DB connection.
CREATE OR REPLACE FUNCTION public.ducky_legacy_admit(ticket uuid, operation_name text, work_reference text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM public.ducky_legacy_gate WHERE singleton AND mode = 'open' FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.ducky_legacy_work(id, operation, reference) VALUES (ticket, operation_name, work_reference);
  RETURN true;
END;
$$;

-- Existing tickets may finish writes while draining. The final seal also fences
-- direct SQL and uninstrumented writers to each old business table.
CREATE OR REPLACE FUNCTION public.ducky_check_legacy_write()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM public.ducky_legacy_gate WHERE singleton AND mode IN ('open','draining') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Legacy business writes are sealed' USING ERRCODE = '55000'; END IF;
  RETURN NULL;
END;
$$;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['calendar_submission','calendar_release_announcement',
    'calendar_release_delivery','calendar_release_roster','duty_weekly_rule','duty_avatar_binding',
    'duty_exchange_request','duty_override','duty_notification_delivery'] LOOP
    EXECUTE format('CREATE OR REPLACE TRIGGER ducky_legacy_write_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.ducky_check_legacy_write()', table_name);
  END LOOP;
END;
$$;
COMMIT;
