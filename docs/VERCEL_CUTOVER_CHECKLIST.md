# 鸭鸭日历正式切流验收清单

正式域名为 `https://calendar.alphapulsex.online/`。负责人确认先以当前 Hobby 账号完成 11 月 28 日前切流，上线后再评估迁至公司/Pro 账号。

## Step 1　正式域名和只读验收

| 项目 | 通过条件 | 2026-11-24 北京时间实测 |
| --- | --- | --- |
| 域名归属 | 两台权威 DNS 返回正式 CNAME 和 Vercel 要求的准确 TXT，Vercel 回读 verified=true | 两台服务器均返回正确 CNAME 并保留预发 TXT。17:44，正式 TXT 校验串第 7 位为字母 l，要求为数字 1，Vercel 验证返回 HTTP 400。待负责人编辑已有正式 TXT 后复测。 |
| 正式 HTTPS | Production 别名指向指定部署，证书对正式域名受信且有效 | 只读部署已 READY；正式域名 TLS 握手未完成。归属通过后绑定并核对证书。 |
| 无登录页面及鉴权 | 正式域名首页、公约、换班页 200；无会话身份接口 401；登录 302 跳转飞书，回调为正式地址；写入口返回只读 403 | 独立部署已验证。上述状态码还须在正式域名用无 Cookie、无 Vercel 绕过凭据的请求回读。 |
| 云端提醒预演 | 在目标 Supabase 运行一次 `ducky_scheduler.enqueue_reminder(true)`，按请求编号回读正式域名的 HTTP 200、`recipientResolved=true`、`sent=false` | 等待正式 HTTPS。直接调用独立部署的预演已通过，正式每日任务仍停用。 |
| 双端飞书登录 | 负责人用桌面与手机飞书直接打开正式地址，登录后看到月历、值日鸭鸭和五章公约，无 Vercel 授权页 | 等待以上检查通过后实测，并由负责人确认进入低峰窗口。此项验证直达网址，原图标在 Step 3 验收。 |

当前只读 Production 部署为 `dpl_CTjz9KkRMvjXkv4WWarvkmyFprDK`，运行代码 `fada875`。[部署详情](https://vercel.com/sa-nb-o/ducky-calendar/CTjz9KkRMvjXkv4WWarvkmyFprDK)

## Step 2　低峰 10 分钟窗口

开始条件为负责人确认正式域名双端登录正常，并确认进入窗口。记录开始、完成时间以及每项结果。

1. 停用妙搭 `duty16hReminder`，从线上回读 disabled。新端保持只读，Supabase 每日任务保持停用。
2. 导出妙搭九张业务表最新快照，备份目标数据，在私有目录核对人员映射和源、目标独有及同键变化。幂等补导并复读九表。17:11 基线为源 210 行、目标 207 行，差额为两条登记和一条旧提醒失败回执，以窗口实际数据为准。历史回执仅入账。
3. 运行 `npm run build:auth` 及 `node --env-file=.env.local scripts/audit_registration_receipts.cjs`。核对原表登记编号、申请人、Mentor、人事和通知状态，退出码为 0。旧窗口仍可能提交，开放写入前复读源端增量；有新增就补齐，未解释的差异保留只读。
4. 关闭 Vercel Production 的 `DUCKY_READ_ONLY` 并重新部署。记录新部署 ID 和代码 SHA，核对正式别名、身份接口及员工访问均可用。
5. 由指定账号实际提交一条请假或晚到，使用同一登记编号核对原表人员字段和机器人私聊回执。Mentor 与人事为同一人时应只有一条私聊。核实消息无原始提及标签，记录脱敏结果。

## Step 3　员工原入口、正式提醒与上线确认

| 操作 | 目标与验收 |
| --- | --- |
| 原企业应用 | 飞书开放平台 → 鸭鸭日历（`cli_aa35caedff78dcc5`）→ 网页应用，设置桌面端和移动端主页为 `https://calendar.alphapulsex.online/`。核对安全设置的回调为 `https://calendar.alphapulsex.online/api/auth/feishu/callback`，按平台发布流程生效并回读可用范围为全员。 |
| 电脑左栏独立链接 | 飞书企业管理后台 → 企业设置 → 企业文化 → 功能配置 → 客户端导航栏配置 → 桌面端 → 默认配置 → 原「鸭鸭日历」链接，将目标改为同一正式地址，保留名称、图标、位置和可见范围，保存下发并回读。10 月 10 日该条目由「通过链接添加」独立配置。[原配置记录](engineering/发布进度.md) |
| 19 人访问 | 核对当前成员覆盖 19/19。普通员工与管理员分别从桌面原左栏和手机工作台原图标进入，检查最终域名、企业 OAuth、月历、值日鸭鸭及鸭鸭公约，全程无需 Vercel 授权或预览码。记录角色、端和结果。 |
| 每日提醒 | 再次确认旧触发器 disabled 后，启用 Supabase `ducky-duty-reminder-1600`。回读 active 与 `0 8 * * *` UTC，登记切换后的首个北京时间 16:00。核对工作日志、请求编号、HTTP 回执、当日值班人、唯一投递及手机实收。 |
| 发布记录与退役 | 汇总部署 ID、代码 SHA、数据核对、原图标实测和调度状态到主文档、DOCX 及飞书更新日志，提交并推送迁移分支。旧妙搭保留至正式稳定运行、首次 16:00 确认实收并获明确批准。五个节日主题保持关闭，全员版本知会按批次另行批准。 |

上线成功后列出两条可清理的预发记录供负责人核对：`calendar-preview.alphapulsex.online` 的 CNAME，以及 `_vercel.alphapulsex.online` 上验证 `calendar-preview.alphapulsex.online` 的旧 TXT。正式 CNAME 和正式验证 TXT 均保留。
