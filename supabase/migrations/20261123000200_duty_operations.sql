ALTER TABLE public.duty_exchange_request
  ADD COLUMN invite_delivery text NOT NULL DEFAULT 'pending',
  ADD COLUMN decision_delivery text NOT NULL DEFAULT 'pending';

-- Service-only transactions. Serialize decisions and reminder claims for the same Beijing date.
CREATE FUNCTION public.ducky_exchange(p_actor text, p_action text, p_id uuid, p_day date DEFAULT NULL, p_invitee text DEFAULT NULL)
RETURNS public.duty_exchange_request
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  old public.duty_exchange_request;
  duty_day date;
  owner_id text;
  cutoff timestamptz;
BEGIN
  IF p_action = 'create' THEN duty_day := p_day;
  ELSE
    SELECT duty_date INTO duty_day FROM public.duty_exchange_request
      WHERE id = p_id AND p_actor IN (initiator_open_id, invitee_open_id);
  END IF;
  IF duty_day IS NULL THEN RAISE SQLSTATE 'PT404' USING MESSAGE = '换班请求不存在。'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ducky-duty'), duty_day - date '2000-01-01');
  SELECT * INTO old FROM public.duty_exchange_request WHERE id = p_id FOR UPDATE;
  cutoff := (duty_day + time '16:00') AT TIME ZONE 'Asia/Shanghai';
  IF p_action = 'create' THEN
    IF old.id IS NOT NULL THEN
      IF old.initiator_open_id <> p_actor OR old.invitee_open_id <> p_invitee OR old.duty_date <> p_day THEN
        RAISE SQLSTATE 'PT409' USING MESSAGE = '换班编号冲突。';
      END IF;
      RETURN old;
    END IF;
    IF clock_timestamp() >= cutoff THEN RAISE SQLSTATE 'PT409' USING MESSAGE = '已过换班截止时间。'; END IF;
    SELECT person_open_id INTO owner_id FROM public.duty_weekly_rule
      WHERE weekday = extract(isodow FROM duty_day) AND status = 'active'
        AND valid_from <= duty_day AND (valid_to IS NULL OR valid_to >= duty_day)
      ORDER BY valid_from DESC, id LIMIT 1;
    IF owner_id IS DISTINCT FROM p_actor THEN RAISE SQLSTATE 'PT403' USING MESSAGE = '仅当天负责人可发起换班。'; END IF;
    IF EXISTS (SELECT FROM public.duty_override WHERE duty_date = duty_day AND status = 'active') THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE = '当天已有生效的换班。';
    END IF;
    IF p_actor = p_invitee OR NOT EXISTS (SELECT FROM public.feishu_users WHERE open_id = p_invitee AND is_active) THEN
      RAISE SQLSTATE 'PT400' USING MESSAGE = '换班对象无效。';
    END IF;
    SELECT * INTO old FROM public.duty_exchange_request WHERE duty_date = duty_day AND state = 'awaiting_confirmation' LIMIT 1;
    IF old.id IS NOT NULL THEN
      IF old.initiator_open_id = p_actor AND old.invitee_open_id = p_invitee THEN RETURN old; END IF;
      RAISE SQLSTATE 'PT409' USING MESSAGE = '当天已有待确认的换班。';
    END IF;
    INSERT INTO public.duty_exchange_request (id, duty_date, initiator_open_id, invitee_open_id, original_person_open_id,
      replacement_person_open_id, state, _expires_at, _created_by, _updated_by)
      VALUES (p_id, duty_day, p_actor, p_invitee, p_actor, p_invitee, 'awaiting_confirmation', cutoff, p_actor, p_actor)
      RETURNING * INTO old;
    RETURN old;
  END IF;
  IF p_action NOT IN ('read','confirm','cancel','reject') THEN RAISE SQLSTATE 'PT400' USING MESSAGE = '决定无效。'; END IF;
  IF (p_action = 'cancel' AND p_actor <> old.initiator_open_id) OR
     (p_action IN ('reject','confirm') AND p_actor <> old.invitee_open_id) THEN
    RAISE SQLSTATE 'PT403' USING MESSAGE = '无权执行此操作。';
  END IF;
  IF old.state <> 'awaiting_confirmation' THEN RETURN old; END IF;
  IF clock_timestamp() >= old._expires_at THEN old.state := 'expired';
  ELSIF p_action = 'read' THEN RETURN old;
  ELSIF p_action = 'cancel' THEN old.state := 'cancelled';
  ELSIF p_action = 'reject' THEN old.state := 'rejected';
  ELSE
    IF NOT EXISTS (SELECT FROM public.feishu_users WHERE open_id = old.invitee_open_id AND is_active) THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE = '被邀请人已停用。';
    END IF;
    UPDATE public.duty_exchange_request SET state = 'confirmed' WHERE id = p_id;
    INSERT INTO public.duty_override (duty_date, original_person_open_id, replacement_person_open_id, replacement_duck_key, request_id, _created_by, _updated_by)
      VALUES (duty_day, old.original_person_open_id, old.invitee_open_id,
        (SELECT duck_key FROM public.duty_avatar_binding WHERE person_open_id = old.invitee_open_id AND status = 'active'),
        p_id, p_actor, p_actor)
      ON CONFLICT (duty_date) WHERE status = 'active' DO NOTHING;
    IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE = '当天已有生效的换班。'; END IF;
    old.state := 'applied'; old._confirmed_at := clock_timestamp();
  END IF;
  UPDATE public.duty_exchange_request SET state = old.state, _confirmed_at = old._confirmed_at,
    _updated_by = p_actor, _updated_at = clock_timestamp() WHERE id = p_id RETURNING * INTO old;
  RETURN old;
END;
$$;

CREATE FUNCTION public.ducky_claim_reminder()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  local_now timestamp := clock_timestamp() AT TIME ZONE 'Asia/Shanghai';
  day date := local_now::date;
  recipient text;
  delivery public.duty_notification_delivery;
BEGIN
  IF local_now::time < time '16:00' OR local_now::time >= time '16:05' THEN
    RETURN jsonb_build_object('claimed',false,'state','outside_window','dutyDate',day);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ducky-duty'), day - date '2000-01-01');
  SELECT * INTO delivery FROM public.duty_notification_delivery WHERE duty_date = day ORDER BY _created_at LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('claimed',false,'state',delivery.state,'dutyDate',day); END IF;
  SELECT coalesce(
    (SELECT replacement_person_open_id FROM public.duty_override WHERE duty_date = day AND status = 'active'),
    (SELECT person_open_id FROM public.duty_weekly_rule WHERE weekday = extract(isodow FROM day) AND status = 'active'
       AND valid_from <= day AND (valid_to IS NULL OR valid_to >= day) ORDER BY valid_from DESC, id LIMIT 1)
  ) INTO recipient;
  IF NOT EXISTS (SELECT FROM public.feishu_users WHERE open_id = recipient AND is_active AND name IS NOT NULL) THEN
    RETURN jsonb_build_object('claimed',false,'state','needs_review','dutyDate',day);
  END IF;
  INSERT INTO public.duty_notification_delivery (idempotency_key,duty_date,final_person_open_id,state,attempt_count,_created_by,_updated_by)
    VALUES (to_char(day,'YYYY-MM-DD') || ':' || recipient, day, recipient, 'pending', 1, recipient, recipient) RETURNING * INTO delivery;
  RETURN jsonb_build_object('claimed',true,'id',delivery.id,'recipient',recipient,'dutyDate',day,'key',delivery.idempotency_key);
END;
$$;

REVOKE ALL ON FUNCTION public.ducky_exchange(text,text,uuid,date,text), public.ducky_claim_reminder() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ducky_exchange(text,text,uuid,date,text), public.ducky_claim_reminder() TO service_role;

CREATE FUNCTION public.ducky_prepare_notice(p_version text, p_hash text, p_actor text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  roster public.calendar_release_roster;
  existing_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ducky-release'),hashtext(p_version));
  SELECT payload_hash INTO existing_hash FROM public.calendar_release_announcement WHERE version=p_version;
  IF FOUND THEN
    IF existing_hash <> p_hash THEN RAISE SQLSTATE 'PT409' USING MESSAGE='该批通知内容已冻结。'; END IF;
    RETURN;
  END IF;
  SELECT * INTO roster FROM public.calendar_release_roster WHERE version=p_version FOR SHARE;
  IF NOT FOUND OR roster.verified_at NOT BETWEEN now()-interval '24 hours' AND now()
     OR roster.source <> 'feishu-contact-v3' OR jsonb_typeof(roster.recipient_ids) <> 'array' THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE='缺少本批次有效的核实名单。';
  END IF;
  IF roster.recipient_count <> jsonb_array_length(roster.recipient_ids) OR roster.recipient_count <>
     (SELECT count(DISTINCT u.open_id) FROM jsonb_array_elements_text(roster.recipient_ids) AS ids(id)
       JOIN public.feishu_users u ON u.open_id=ids.id AND u.is_active) THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE='收件人已变更，请核对名单。';
  END IF;
  INSERT INTO public.calendar_release_announcement(version,payload_hash,expected_count,_created_by)
    VALUES(p_version,p_hash,roster.recipient_count,p_actor);
  INSERT INTO public.calendar_release_delivery(version,recipient,_created_by)
    SELECT p_version,id,p_actor FROM jsonb_array_elements_text(roster.recipient_ids) AS ids(id);
END;
$$;
REVOKE ALL ON FUNCTION public.ducky_prepare_notice(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ducky_prepare_notice(text,text,text) TO service_role;
