-- Run with psql -X -f scripts/set_member_birthday.sql using the intended service-role connection.
-- Enter a single member at the prompts. Existing month/day may be cleared with two empty answers.
\set ON_ERROR_STOP on
\prompt 'Member open_id: ' member_id
\prompt 'Birth month (1-12): ' birth_month
\prompt 'Birth day (1-31): ' birth_day
update public.feishu_users
   set birth_month = nullif(:'birth_month', '')::smallint,
       birth_day = nullif(:'birth_day', '')::smallint
 where open_id = :'member_id' and is_active;
