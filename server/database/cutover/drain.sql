-- First disable legacy external jobs/administrative writers. Confirm the guarded
-- release serves all instances and earlier release invocations have finished.
BEGIN;
UPDATE public.ducky_legacy_gate SET mode = 'draining' WHERE singleton AND mode = 'open';
COMMIT;
SELECT mode, (SELECT count(*) FROM public.ducky_legacy_work) AS outstanding
FROM public.ducky_legacy_gate WHERE singleton;
-- Inspect surviving tickets individually. A crash, exception, or ambiguous
-- external receipt requires source/Base/message reconciliation before clearing
-- that ticket by ID. Elapsed time is never proof of completion.
SELECT id, operation, reference, state, started_at FROM public.ducky_legacy_work ORDER BY started_at;
