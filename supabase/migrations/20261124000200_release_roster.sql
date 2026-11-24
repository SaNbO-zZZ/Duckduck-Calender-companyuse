-- Both staging and publishing use the same per-version transaction lock.
CREATE FUNCTION public.ducky_stage_release_roster(p_version text, p_ids text[], p_apply boolean)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  total integer := cardinality(p_ids);
  known integer;
BEGIN
  IF p_version IS NULL OR length(p_version) > 32 OR
     p_version !~ '^(v[0-9]+\.[0-9]+\.[0-9]+|notice-entry-20261025)$' OR
     p_apply IS NULL OR coalesce(total, 0) = 0 OR array_ndims(p_ids) <> 1 THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = '批次或名单无效。';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ducky-release'), hashtext(p_version));
  IF EXISTS (SELECT FROM public.calendar_release_announcement WHERE version = p_version) THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = '该批名单已冻结。';
  END IF;
  SELECT count(*) INTO known FROM (
    SELECT open_id FROM public.feishu_users WHERE open_id = ANY(p_ids) AND is_active FOR SHARE
  ) AS members;
  IF known <> total THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = '名单含未知或停用人员。';
  END IF;
  IF p_apply THEN
    INSERT INTO public.calendar_release_roster(version, recipient_ids, recipient_count, verified_at, source)
      VALUES (p_version, to_jsonb(p_ids), total, date_trunc('milliseconds', now()), 'feishu-contact-v3')
    ON CONFLICT (version) DO UPDATE SET recipient_ids = EXCLUDED.recipient_ids,
      recipient_count = EXCLUDED.recipient_count, verified_at = EXCLUDED.verified_at,
      source = EXCLUDED.source, _updated_at = now(), _updated_by = NULL;
  END IF;
  RETURN total;
END;
$$;
REVOKE ALL ON FUNCTION public.ducky_stage_release_roster(text,text[],boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ducky_stage_release_roster(text,text[],boolean) TO service_role;
