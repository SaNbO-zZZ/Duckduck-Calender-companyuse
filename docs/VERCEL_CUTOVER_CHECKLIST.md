# 鸭鸭日历正式切流验收清单

正式域名为 `https://calendar.alphapulsex.online/`。负责人确认先以当前 Hobby 账号完成 11 月 28 日前切流，上线后再评估迁至公司/Pro 账号。

## Step 1　正式域名和只读验收

| 项目 | 通过条件 | 2026-11-24 北京时间实测 |
| --- | --- | --- |
| 域名归属 | 两台权威 DNS 返回正式 CNAME 和 Vercel 要求的准确 TXT，Vercel 回读 verified=true | 通过。两台权威 DNS 均返回正确 CNAME 和正式 TXT。Vercel 回读 verified=true。 |
| 正式 HTTPS | Production 别名指向指定部署，证书对正式域名受信且有效 | 通过。17:48 正式别名绑定至下列只读 Production 部署，API 回读部署 ID 一致。公开访问证书校验成功，Let’s Encrypt 证书覆盖正式主机，有效至 2027-02-22。 |
| 无登录页面及鉴权 | 正式域名首页、公约、换班页 200；无会话身份接口 401；登录 302 跳转飞书，回调为正式地址；写入口返回只读 403 | 通过。首页、公约、换班页均为 200；身份接口 401；登录 302 至飞书，回调为正式域名且使用 PKCE S256；登记、换班、公约、节日和版本知会五个写入口均为只读 403。访问无需 Vercel 授权。 |
| 云端提醒预演 | 在目标 Supabase 运行一次 `ducky_scheduler.enqueue_reminder(true)`，按请求编号回读正式域名的 HTTP 200、`recipientResolved=true`、`sent=false` | 通过。17:49:01 入队 #1，pg_net 同编号回执为 HTTP 200，dryRun=true、recipientResolved=true、sent=false。每日任务回读 active=false。 |
| 双端飞书登录 | 负责人用桌面与手机飞书直接打开正式地址，登录后看到月历、值日鸭鸭和五章公约，无 Vercel 授权页 | 通过。负责人已确认桌面及手机飞书直达正式地址，登录后月历、值日鸭鸭和五章公约显示正常，并同意立即进入窗口。员工原图标单独在 Step 3 验收。 |

Step 1 核验的只读 Production 部署为 `dpl_CTjz9KkRMvjXkv4WWarvkmyFprDK`，运行代码 `fada875`。[部署详情](https://vercel.com/sa-nb-o/ducky-calendar/CTjz9KkRMvjXkv4WWarvkmyFprDK)

## Step 2　低峰 10 分钟窗口

开始条件为负责人确认正式域名双端登录正常，并确认进入窗口。记录开始、完成时间以及每项结果。

1. 停用妙搭 `duty16hReminder`，从线上回读 disabled。新端保持只读，Supabase 每日任务保持停用。
2. 导出妙搭九张业务表最新快照，备份目标数据，在私有目录核对人员映射和源、目标独有及同键变化。幂等补导并复读九表。17:11 基线为源 210 行、目标 207 行，差额为两条登记和一条旧提醒失败回执，以窗口实际数据为准。历史回执仅入账。
3. 运行 `npm run build:auth` 及 `node --env-file=.env.local scripts/audit_registration_receipts.cjs`。核对原表登记编号、申请人、Mentor、人事和通知状态，退出码为 0。旧窗口仍可能提交，开放写入前复读源端增量；有新增就补齐，未解释的差异保留只读。
4. 关闭 Vercel Production 的 `DUCKY_READ_ONLY` 并重新部署。记录新部署 ID 和代码 SHA，核对正式别名、身份接口及员工访问均可用。
5. 由指定账号实际提交一条请假或晚到，使用同一登记编号核对原表人员字段和机器人私聊回执。Mentor 与人事为同一人时应只有一条私聊。核实消息无原始提及标签，记录脱敏结果。

### 本次窗口回执

| 项目 | 11 月 24 日北京时间实测 |
| --- | --- |
| 停旧提醒 | 17:51:36，妙搭云端回读 `duty16hReminder=disabled`。 |
| 最终数据 | 九表源端 210、目标端 207。备份后补入两条登记及一条历史失败回执，幂等导入执行两次，九表两端均为 210 行，逐字段零差异。17:54:05 复读源端，全部指纹一致。 |
| 原表对账 | 76/76 笔登记的编号、申请人、Mentor、人事与通知状态全部匹配，无重复或未完成。另有 3 行原表历史数据无登记编号，已保留。 |
| 正式写入 | 17:54，Production 的 `DUCKY_READ_ONLY=0`。正式域名回读部署 `dpl_tJxzHXhP95isBCKsi9g6UMwu9g7D`，运行代码 `fada875b1044c5d16c6c13c4ffa3b94cec928dbe`。匿名首页 200、登记接口 401，登录 302 到飞书，回调为正式地址。[部署详情](https://vercel.com/sa-nb-o/ducky-calendar/tJxzHXhP95isBCKsi9g6UMwu9g7D) |
| 真实登记 | 等待指定账号提交一条真实请假或晚到，并按同一登记核对飞书人员字段、私聊内容及去重。 |

## Step 3　员工原入口、正式提醒与上线确认

| 操作 | 目标与验收 |
| --- | --- |
| 原企业应用 | 飞书开放平台 → 鸭鸭日历（`cli_aa35caedff78dcc5`）→ 网页应用，设置桌面端和移动端主页为 `https://calendar.alphapulsex.online/`。核对安全设置的回调为 `https://calendar.alphapulsex.online/api/auth/feishu/callback`，按平台发布流程生效并回读可用范围为全员。 |
| 电脑左栏独立链接 | 飞书企业管理后台 → 企业设置 → 企业文化 → 功能配置 → 客户端导航栏配置 → 桌面端 → 默认配置 → 原「鸭鸭日历」链接，将目标改为同一正式地址，保留名称、图标、位置和可见范围，保存下发并回读。10 月 10 日该条目由「通过链接添加」独立配置。[原配置记录](engineering/发布进度.md) |
| 19 人访问 | 核对当前成员覆盖 19/19。普通员工与管理员分别从桌面原左栏和手机工作台原图标进入，检查最终域名、企业 OAuth、月历、值日鸭鸭及鸭鸭公约，全程无需 Vercel 授权或预览码。记录角色、端和结果。 |
| 每日提醒 | 再次确认旧触发器 disabled 后，启用 Supabase `ducky-duty-reminder-1600`。回读 active 与 `0 8 * * *` UTC，登记切换后的首个北京时间 16:00。核对工作日志、请求编号、HTTP 回执、当日值班人、唯一投递及手机实收。 |
| 发布记录与退役 | 汇总部署 ID、代码 SHA、数据核对、原图标实测和调度状态到主文档、DOCX 及飞书更新日志，提交并推送迁移分支。旧妙搭保留至正式稳定运行、首次 16:00 确认实收并获明确批准。五个节日主题保持关闭，全员版本知会按批次另行批准。 |

上线成功后列出两条可清理的预发记录供负责人核对：`calendar-preview.alphapulsex.online` 的 CNAME，以及 `_vercel.alphapulsex.online` 上验证 `calendar-preview.alphapulsex.online` 的旧 TXT。正式 CNAME 和正式验证 TXT 均保留。
