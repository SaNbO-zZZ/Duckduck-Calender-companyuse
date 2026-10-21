BEGIN;
CREATE TABLE calendar_release_announcement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version varchar(32) NOT NULL UNIQUE,
  payload_hash varchar(64) NOT NULL,
  expected_count integer NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'sending',
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);
CREATE TABLE calendar_release_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version varchar(32) NOT NULL REFERENCES calendar_release_announcement(version),
  recipient varchar(32) NOT NULL,
  state varchar(24) NOT NULL DEFAULT 'pending',
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile,
  CONSTRAINT calendar_release_delivery_version_recipient_key UNIQUE (version, recipient)
);
ALTER TABLE calendar_release_announcement ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_release_delivery ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_bypass_policy ON calendar_release_announcement TO service_role USING (true);
CREATE POLICY service_role_bypass_policy ON calendar_release_delivery TO service_role USING (true);
CREATE POLICY "修改全部数据" ON calendar_release_announcement AS PERMISSIVE FOR ALL TO authenticated USING (false);
CREATE POLICY "查看全部数据" ON calendar_release_announcement AS PERMISSIVE FOR SELECT TO authenticated, anon USING (current_setting('app.user_id', TRUE) = ((_created_by).user_id)::text);
CREATE POLICY "修改本人数据" ON calendar_release_announcement AS PERMISSIVE FOR ALL TO authenticated USING (current_setting('app.user_id', TRUE) = ((_created_by).user_id)::text) WITH CHECK (current_setting('app.user_id', TRUE) = ((_created_by).user_id)::text);
CREATE POLICY "修改全部数据" ON calendar_release_delivery AS PERMISSIVE FOR ALL TO authenticated USING (false);
CREATE POLICY "查看全部数据" ON calendar_release_delivery AS PERMISSIVE FOR SELECT TO authenticated, anon USING (current_setting('app.user_id', TRUE) = ((_created_by).user_id)::text);
CREATE POLICY "修改本人数据" ON calendar_release_delivery AS PERMISSIVE FOR ALL TO authenticated USING (current_setting('app.user_id', TRUE) = ((_created_by).user_id)::text) WITH CHECK (current_setting('app.user_id', TRUE) = ((_created_by).user_id)::text);
COMMENT ON TABLE calendar_release_announcement IS '鸭鸭日历版本更新通知：每个版本只创建一次收件批次。';
COMMENT ON TABLE calendar_release_delivery IS '逐位员工记录消息请求是否被平台受理；不等同于已读。';
COMMIT;