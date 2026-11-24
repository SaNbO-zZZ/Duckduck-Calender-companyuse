-- NULL preserves legacy receipts whose Base status was managed by Miaoda.
-- New submissions remain false until the status update is acknowledged by Base.
ALTER TABLE public.calendar_submission ADD COLUMN base_status_synced boolean;
