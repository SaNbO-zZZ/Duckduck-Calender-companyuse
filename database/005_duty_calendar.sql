BEGIN;
CREATE TABLE duty_weekly_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday integer NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  person_id user_profile NOT NULL,
  duck_key varchar(40) NOT NULL,
  valid_from varchar(10) NOT NULL,
  valid_to varchar(10),
  status varchar(16) NOT NULL DEFAULT 'active',
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);
CREATE TABLE duty_override (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_date varchar(10) NOT NULL,
  original_person_id user_profile NOT NULL,
  replacement_person_id user_profile NOT NULL,
  replacement_duck_key varchar(40),
  request_id uuid,
  status varchar(16) NOT NULL DEFAULT 'active',
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);
CREATE UNIQUE INDEX duty_override_date_active_key ON duty_override(duty_date) WHERE status = 'active';
CREATE TABLE duty_avatar_binding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id user_profile NOT NULL,
  duck_key varchar(40) NOT NULL,
  manifest_version varchar(40) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active',
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);
CREATE UNIQUE INDEX duty_avatar_binding_person_key ON duty_avatar_binding(person_id);
CREATE TABLE duty_exchange_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_date varchar(10) NOT NULL,
  initiator_id user_profile NOT NULL,
  invitee_id user_profile NOT NULL,
  original_person_id user_profile NOT NULL,
  replacement_person_id user_profile NOT NULL,
  state varchar(32) NOT NULL DEFAULT 'draft',
  _expires_at TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  _confirmed_at TIMESTAMP(3) WITH TIME ZONE,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);
CREATE INDEX duty_exchange_request_date_idx ON duty_exchange_request(duty_date);
CREATE TABLE duty_notification_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key varchar(160) NOT NULL,
  duty_date varchar(10) NOT NULL,
  final_person_id user_profile NOT NULL,
  state varchar(24) NOT NULL DEFAULT 'pending',
  error_code varchar(120),
  attempt_count integer NOT NULL DEFAULT 0,
  _accepted_at TIMESTAMP(3) WITH TIME ZONE,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);
CREATE UNIQUE INDEX duty_notification_delivery_idempotency_key ON duty_notification_delivery(idempotency_key);

ALTER TABLE duty_weekly_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_avatar_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_exchange_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_notification_delivery ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_bypass_policy ON duty_weekly_rule TO service_role USING (true);
CREATE POLICY service_role_bypass_policy ON duty_override TO service_role USING (true);
CREATE POLICY service_role_bypass_policy ON duty_avatar_binding TO service_role USING (true);
CREATE POLICY service_role_bypass_policy ON duty_exchange_request TO service_role USING (true);
CREATE POLICY service_role_bypass_policy ON duty_notification_delivery TO service_role USING (true);

CREATE POLICY "修改全部数据" ON duty_weekly_rule AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "查看全部数据" ON duty_weekly_rule AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON duty_weekly_rule AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "修改全部数据" ON duty_override AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "查看全部数据" ON duty_override AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON duty_override AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "修改全部数据" ON duty_avatar_binding AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "查看全部数据" ON duty_avatar_binding AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON duty_avatar_binding AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "修改全部数据" ON duty_exchange_request AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "查看全部数据" ON duty_exchange_request AS PERMISSIVE FOR SELECT TO authenticated, anon USING (current_setting('app.user_id', TRUE) = ((_created_by).user_id)::text OR current_setting('app.user_id', TRUE) = ((initiator_id).user_id)::text OR current_setting('app.user_id', TRUE) = ((invitee_id).user_id)::text);
CREATE POLICY "修改本人数据" ON duty_exchange_request AS PERMISSIVE FOR ALL TO authenticated USING (current_setting('app.user_id', TRUE) = ((_created_by).user_id)::text OR current_setting('app.user_id', TRUE) = ((initiator_id).user_id)::text) WITH CHECK (current_setting('app.user_id', TRUE) = ((_created_by).user_id)::text OR current_setting('app.user_id', TRUE) = ((initiator_id).user_id)::text);
CREATE POLICY "修改全部数据" ON duty_notification_delivery AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "查看全部数据" ON duty_notification_delivery AS PERMISSIVE FOR SELECT TO authenticated, anon USING (current_setting('app.user_id', TRUE) = ((final_person_id).user_id)::text OR current_setting('app.user_id', TRUE) = ((_created_by).user_id)::text);
CREATE POLICY "修改本人数据" ON duty_notification_delivery AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE duty_weekly_rule IS '按自然周的固定值日规则；person_id 使用稳定人员 ID，姓名由运行时解析。';
COMMENT ON TABLE duty_override IS '指定自然日临时覆盖；仅确认后的换班写入 active。';
COMMENT ON TABLE duty_avatar_binding IS '人员与鸭鸭角色绑定；与固定排班独立建模。';
COMMENT ON TABLE duty_exchange_request IS '值日换班请求和双方确认审计。';
COMMENT ON TABLE duty_notification_delivery IS '16:00 值日通知投递状态与幂等键。';
COMMIT;
