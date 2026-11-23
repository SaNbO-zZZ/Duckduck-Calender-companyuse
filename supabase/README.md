# Supabase 迁移基线

Ducky Calendar 云项目已经通过 SQL Editor 执行 `20261123000100_phase1.sql`。该文件创建 13 张表及服务端登录、导入函数。首次使用 Supabase CLI 管理这个项目时，先运行 `supabase migration list --linked`。如果远端缺少 `20261123000100`，核对已建对象后执行 `supabase migration repair 20261123000100 --status applied --linked`，然后再推送后续迁移。

在新的 Supabase 项目中，通过迁移工具或 `psql --single-transaction -v ON_ERROR_STOP=1` 执行建表文件。随后在仓库根目录选择一种导入方式。

| 连接 | 本机环境变量 | 命令 |
| --- | --- | --- |
| Supabase HTTPS | `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` | `python3 scripts/import_miaoda.py --rest` |
| PostgreSQL | `DATABASE_URL` | `python3 scripts/import_miaoda.py` |

导入器默认读取 Git 忽略的 `tmp-migration-backup/`，需要 Python 3.9 或以上版本以及所选连接方式对应的 curl 或 psql。环境变量须在运行进程中可见。脚本核对来源应用、九张表的哈希和计数，转换人员字段、提醒幂等键和收件名单，并在同一事务中写入。相同业务行可以重复导入，已有业务行的内容发生冲突时整个事务回滚。后续登录更新的姓名、头像、角色和停用状态会保留。

Phase 1 的数据时点是 2026-11-23 的妙搭生产快照。切流前需另行核对该时点之后的业务新增和修改。
