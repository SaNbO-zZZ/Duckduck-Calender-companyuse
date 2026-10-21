BEGIN;
CREATE TABLE calendar_release_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version varchar(32) NOT NULL UNIQUE,
  recipient_ids jsonb NOT NULL,
  recipient_count integer NOT NULL CHECK (recipient_count > 0),
  verified_at TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  source varchar(80) NOT NULL,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);
ALTER TABLE calendar_release_roster ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_bypass_policy ON calendar_release_roster TO service_role USING (true);
CREATE POLICY "修改全部数据" ON calendar_release_roster AS PERMISSIVE FOR ALL TO authenticated USING (false);
CREATE POLICY "查看全部数据" ON calendar_release_roster AS PERMISSIVE FOR SELECT TO authenticated, anon USING (false);
CREATE POLICY "修改本人数据" ON calendar_release_roster AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
COMMENT ON TABLE calendar_release_roster IS '从飞书正式通讯录核对后的每版本员工快照；仅服务端读取，24 小时内有效。';
COMMIT;