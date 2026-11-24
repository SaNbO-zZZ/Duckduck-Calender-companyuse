# Duckduck-Calender-companyuse · 鸭鸭日历

公司内部使用的鸭鸭日历。本仓库公开工程源码与演进记录：保留飞书妙搭的真实 Git 历史，同时保存前期单文件原型、Claude 协作提示词、原创鸭鸭素材和视觉验收证据。公开可见不等于授权再利用；仓库未授予素材或代码的再分发许可，使用前请取得权利人许可。线上员工登记数据不在此仓库。

## 当前线上版本

自 2026-11-24 起，员工可从桌面飞书原左栏和手机工作台原应用进入新版。正式站使用 Vercel 与 Supabase，登记继续写入原飞书多维表格。飞书企业应用版本为 1.0.5。[打开鸭鸭日历](https://calendar.alphapulsex.online/) · [切流实测记录](docs/VERCEL_CUTOVER_CHECKLIST.md)

## 妙搭历史修复

`v3.3.2` 已于 2026-11-06 发布：兼容中央气象台合肥站实况中偶发的未知天气描述，避免误显示“天气暂不可用”；背景进入视觉降级时仍保留轻量鸭鸭动画。妙搭 release `7704718438245649675` 已回读 `finished`，完整工程说明见 [`docs/engineering/v3.3.2-天气实况与鸭鸭动画修复.md`](docs/engineering/v3.3.2-天气实况与鸭鸭动画修复.md)。

## Vercel + Supabase 迁移

迁移分支以 React/Vite 渲染日历，Vercel Functions 处理飞书登录与业务接口。Supabase 保存排班、换班、幂等、员工目录、公约和节日配置。请假与迟到早退继续使用原飞书多维表格。正式部署、数据对账、飞书入口和定时任务的验收结果见[切流验收清单](docs/VERCEL_CUTOVER_CHECKLIST.md)。线上入口与历史发布以[工作主文档](docs/鸭鸭日历工作主文档.md)为准。

## 代码与目录

| 路径 | 用途 |
| --- | --- |
| `client/`、`api/`、`lib/`、`shared/` | 迁移分支运行的日历前端、Vercel Functions 与共享逻辑。 |
| `supabase/` | Supabase 业务表、权限和 16:00 调度迁移。 |
| `server/`、`database/` | 妙搭基线和回归验证依赖。 |
| `archive/miaoda-single-file/` | 妙搭单文件设计的脱敏副本、导出脚本和来源记录。 |
| `archive/local-history/` | 早期真实留存的 HTML、复核脚本与快照；只作追溯。 |
| `archive/claude-prompts/` | 交给 Claude 的三轮开发提示词；Claude 云端会话与未导出的中间文件不在此仓库。 |
| `assets/duck-original-24/` | 公司原创 24 款鸭鸭表情包的解压源素材与清单。 |
| `assets/halloween-2026/` | 2026 年万圣节限时主题的桌面与手机日夜场景素材。 |
| `archive/visual-review/` | 天气、九只鸭鸭、窄屏和性能的截图与视频证据。 |
| `docs/engineering/` | 各次排障、发布和性能优化的工程记录。 |
| `scripts/refresh_release_roster.py` | 发版前从飞书正式通讯录核对全员，并向妙搭写入该版私聊名单；不保存名单到 Git。 |

原始 60 MiB ZIP 与解压素材重复，因此未提交 ZIP；`node_modules/`、构建产物、日志、环境变量和本机授权文件也不进入仓库。首次运行请参考 `.env.example`，真实配置只放本机或飞书平台的安全配置中。

## 版本口径

`v3.0.1` 至 `v3.3.1` 可映射到妙搭工程中真实存在的发布提交，详见 [版本与来源](docs/VERSION_HISTORY.md)。`v1.x`、`v2.x` 和本地 `v3.0.0` 是依据会话与文件归档整理的阶段编号；它们不是凭空重建的原始 Git 提交，因此不打冒充正式发布的 Tag。

本仓库的 `main` 保存可追溯的妙搭代码及后续归档提交。要精确取得某个已发布版本的运行代码，请检出相应 Tag；`main` 最新提交还包含归档文档与素材。飞书企业应用版本独立编号，本次切流发布 `1.0.5`。

## 本地检查

使用 Node.js 24 和 npm 10 或更新版本。

```bash
npm ci
npm run lint
npm test
npm run preview:phase3
```

`npm test` 构建前端、Serverless Functions 和妙搭回归依赖，再运行全部自动测试。示例预览在 `127.0.0.1:4173` 使用合成数据。预发阶段通过飞书登录，且只允许已导入的有效企业成员访问。Vercel Preview 默认禁止业务写入和真实提醒，可在可信本地环境使用 `DUCKY_READ_ONLY=1` 验证相同限制。

预发使用 Vercel Preview 环境，`APP_BASE_URL` 指向固定预发地址，飞书 OAuth 需登记同一地址下的 `/api/auth/feishu/callback`。配置名见 [`.env.example`](.env.example)。密钥在 Vercel 后台按环境配置，数据库导入连接串仅保存在迁移操作者的本机。Git 分支和恢复命令见 [Git 工作流](docs/GIT_WORKFLOW.md)。

## Vercel 版知会名单

在目标 Supabase 应用 `20261124000200_release_roster.sql` 后，使用 Node.js 24 和本机 `.env.local` 中的 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`。先确认原企业飞书应用具备覆盖所有员工的通讯录可见范围，再预演指定版本。

```bash
node --env-file=.env.local scripts/refresh_supabase_roster.mjs v3.4.0
```

用独立核实的本批员工人数校验写入。以下版本号和人数为用法示例，应替换为实际值。

```bash
node --env-file=.env.local scripts/refresh_supabase_roster.mjs v3.4.0 --apply --expect-count 19
```

工具从根部门逐页读取员工，按目标应用的 `open_id` 去重，核对 Supabase 有效人员，输出部门数和收件人数。新员工可先通过正式飞书登录补全身份。名单有效期为 24 小时，已创建投递批次的名单被冻结。该命令只准备名单，全员知会仍须由管理员按批次批准并另行发布。
