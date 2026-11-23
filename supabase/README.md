# Supabase 迁移基线

Ducky Calendar 云项目已经通过 SQL Editor 执行 `20261123000100_phase1.sql`。该文件创建 13 张表及服务端登录、导入函数。首次使用 Supabase CLI 管理这个项目时，先运行 `supabase migration list --linked`。如果远端缺少 `20261123000100`，核对已建对象后执行 `supabase migration repair 20261123000100 --status applied --linked`，然后再推送后续迁移。

在新的 Supabase 项目中，通过迁移工具或 `psql --single-transaction -v ON_ERROR_STOP=1` 执行建表文件。随后在仓库根目录选择一种导入方式。

| 连接 | 本机环境变量 | 命令 |
| --- | --- | --- |
| Supabase HTTPS | `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` | `python3 scripts/import_miaoda.py --rest` |
| PostgreSQL | `DATABASE_URL` | `python3 scripts/import_miaoda.py` |

导入器默认读取 Git 忽略的 `tmp-migration-backup/`，需要 Python 3.9 或以上版本以及所选连接方式对应的 curl 或 psql。环境变量须在运行进程中可见。脚本核对来源应用、九张表的哈希和计数，转换人员字段、提醒幂等键和收件名单，并在同一事务中写入。相同业务行可以重复导入，已有业务行的内容发生冲突时整个事务回滚。后续登录更新的姓名、头像、角色和停用状态会保留。

Phase 1 的数据时点是 2026-11-23 的妙搭生产快照。切流前需另行核对该时点之后的业务新增和修改。

## Phase 2 业务函数与值日提醒

云项目已在一次事务中执行 `20261123000200_duty_operations.sql` 和 `20261123000300_reminder_schedule.sql`。通过 SQL Editor 应用的版本需要在首次使用 CLI 时一起核对并补录迁移记录。换班、提醒领取和批次通知准备三个 RPC 只对服务端角色开放。

云端任务 `ducky-duty-reminder-1600` 使用 UTC 的 `0 8 * * *`，初始状态为停用。预发时在目标 Vercel 环境设置 `CRON_SECRET`，并用 Supabase Vault 保存同值的 `ducky_cron_secret`。使用带 Bearer 凭证的 `GET /api/cron/duty-reminder?dryRun=1` 核实排班解析，返回的 `sent` 应为 `false`。切流获批后，先停用妙搭触发器，再启用该任务。通过 `cron.job_run_details`、`net._http_response` 和 `duty_notification_delivery` 分别核对触发时间、HTTP 回执和最终投递状态。出现 `needs_review` 时核对平台回执再处理。

全员消息还需管理员会话、24 小时内核实的版本名单，以及与获批批次完全相同的服务端配置 `APPROVED_BROADCAST_VERSION`。日常部署留空。

## Phase 3 公约与节日

`20261123000400_festivals.sql` 为五个节日初始化配置，重复执行保留已有审批结果。目标云项目已通过服务端接口按同一批数据初始化，五个主题在 Phase 3 验收时全部停用。员工首页按北京时间和节期读取已批准主题，管理员预览只影响当前页面。

公约同步固定读取飞书知识库中的鸭鸭公约，核对读取前后的文档修订号后，整批写入该版本的章节。已阅记录按账号和版本去重。重新同步同一版本不会覆盖管理员选定的配图和重点标记。
