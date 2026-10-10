CREATE TABLE calendar_submission (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
request_key uuid NOT NULL UNIQUE,
applicant user_profile NOT NULL,
mentor user_profile NOT NULL,
hr user_profile NOT NULL,
kind varchar(12) NOT NULL,
leave_type varchar(30) NOT NULL DEFAULT '',
start_ms bigint NOT NULL,
end_ms bigint NOT NULL,
submitted_ms bigint NOT NULL,
payload_hash varchar(64) NOT NULL,
record_id varchar(80),
record_state varchar(24) NOT NULL DEFAULT 'creating',
mentor_state varchar(24) NOT NULL DEFAULT 'pending',
hr_state varchar(24) NOT NULL DEFAULT 'pending',
_created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
_created_by user_profile,
_updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
_updated_by user_profile
);
ALTER TABLE calendar_submission ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_bypass_policy ON calendar_submission TO service_role USING (true);
CREATE POLICY "修改全部数据" ON calendar_submission AS PERMISSIVE FOR ALL TO authenticated USING (false);
CREATE POLICY "查看全部数据" ON calendar_submission AS PERMISSIVE FOR SELECT TO authenticated, anon USING (current_setting('app.user_id',TRUE)=((_created_by).user_id)::text);
CREATE POLICY "修改本人数据" ON calendar_submission AS PERMISSIVE FOR ALL TO authenticated USING (current_setting('app.user_id',TRUE)=((_created_by).user_id)::text);
COMMENT ON TABLE calendar_submission IS '鸭鸭日历提交幂等与逐人通知状态，不包含请假原因。';
