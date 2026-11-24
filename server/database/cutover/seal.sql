-- Run after drain.sql and external reconciliation, before the final export.
BEGIN;
DO $$
BEGIN
  PERFORM 1 FROM public.ducky_legacy_gate WHERE singleton AND mode IN ('draining','sealed') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Close admission before sealing'; END IF;
  IF EXISTS (SELECT FROM public.ducky_legacy_work) THEN RAISE EXCEPTION 'Outstanding legacy work'; END IF;
  UPDATE public.ducky_legacy_gate SET mode = 'sealed' WHERE singleton;
END;
$$;
COMMIT;
SELECT mode, (SELECT count(*) FROM public.ducky_legacy_work) AS outstanding
FROM public.ducky_legacy_gate WHERE singleton;
