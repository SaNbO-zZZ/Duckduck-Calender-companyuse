BEGIN;
ALTER POLICY "查看全部数据" ON calendar_release_roster
  USING (current_setting('app.user_id', TRUE) = ((_created_by).user_id)::text);
COMMENT ON TABLE calendar_release_roster IS '从飞书正式通讯录核对后的每版本员工快照；仅导入者与服务角色可读取，24 小时内有效。';
COMMIT;