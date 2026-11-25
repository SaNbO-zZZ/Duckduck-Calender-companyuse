-- Existing table grants and service-role-only RLS apply to both nullable columns.
alter table public.feishu_users
  add column birth_month smallint check (birth_month between 1 and 12),
  add column birth_day smallint check (birth_day between 1 and 31),
  add constraint valid_birthday check (
    (birth_month is null) = (birth_day is null)
    and birth_day <= case when birth_month = 2 then 29
                          when birth_month in (4, 6, 9, 11) then 30 else 31 end
  );
