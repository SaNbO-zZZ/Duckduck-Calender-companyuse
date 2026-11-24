-- Run only in a fresh isolated database after Phase 1, duty operations and roster migrations.
BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO public.feishu_users(open_id, is_active) VALUES ('ou_test1', true), ('ou_disabled', false);
DO $$
DECLARE ids text[];
BEGIN
  IF has_function_privilege('authenticated','public.ducky_stage_release_roster(text,text[],boolean)','EXECUTE')
     OR has_function_privilege('anon','public.ducky_stage_release_roster(text,text[],boolean)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.ducky_stage_release_roster(text,text[],boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'incorrect grants';
  END IF;
  ASSERT public.ducky_stage_release_roster('v1.0.0', ARRAY['ou_test1'], false) = 1;
  ASSERT NOT EXISTS(SELECT FROM public.calendar_release_roster);
  ASSERT public.ducky_stage_release_roster('v1.0.0', ARRAY['ou_test1'], true) = 1;
  ASSERT public.ducky_stage_release_roster('v1.0.0', ARRAY['ou_test1'], true) = 1;
  ASSERT (SELECT count(*) = 1 FROM public.calendar_release_roster);
  FOREACH ids SLICE 1 IN ARRAY ARRAY[['ou_test1','ou_unknown'],['ou_test1','ou_disabled'],['ou_test1','ou_test1']] LOOP
    BEGIN
      PERFORM public.ducky_stage_release_roster('v1.0.0', ids, true);
      RAISE EXCEPTION 'accepted invalid recipient set';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
    END;
  END LOOP;
  BEGIN
    PERFORM public.ducky_stage_release_roster('v1.0.0', ARRAY[]::text[], true);
    RAISE EXCEPTION 'accepted an empty roster';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL;
  END;
  ASSERT (SELECT recipient_ids = '["ou_test1"]'::jsonb AND recipient_count=1 FROM public.calendar_release_roster);
  ASSERT NOT EXISTS(SELECT FROM public.calendar_release_announcement);
  ASSERT NOT EXISTS(SELECT FROM public.calendar_release_delivery);
END $$;
SELECT public.ducky_prepare_notice('v1.0.0','synthetic', 'ou_test1');
DO $$ BEGIN
  BEGIN
    PERFORM public.ducky_stage_release_roster('v1.0.0', ARRAY['ou_test1'], true);
    RAISE EXCEPTION 'accepted a frozen batch';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  ASSERT (SELECT count(*) = 1 FROM public.calendar_release_delivery);
END $$;
ROLLBACK;
