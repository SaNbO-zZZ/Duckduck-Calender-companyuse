-- After platform schema promotion, initialize the destination workspace before
-- publishing a writer that requires the gate. Existing modes are preserved.
BEGIN;
INSERT INTO ducky_legacy_gate (singleton, mode) VALUES (true, 'open')
ON CONFLICT (singleton) DO NOTHING;
COMMIT;
SELECT mode, (SELECT count(*) FROM ducky_legacy_work) AS outstanding
FROM ducky_legacy_gate WHERE singleton;
