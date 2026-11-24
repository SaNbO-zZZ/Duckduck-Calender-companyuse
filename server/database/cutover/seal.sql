-- Run after drain.sql and external reconciliation, before the final export.
BEGIN;
SELECT ducky_legacy_seal();
COMMIT;
SELECT mode, (SELECT count(*) FROM ducky_legacy_work) AS outstanding
FROM ducky_legacy_gate WHERE singleton;
