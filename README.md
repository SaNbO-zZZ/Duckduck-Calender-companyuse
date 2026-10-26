# Duckduck-Calender-companyuse · 鸭鸭日历

公司内部使用的鸭鸭日历。本仓库公开工程源码与演进记录：保留飞书妙搭的真实 Git 历史，同时保存前期单文件原型、Claude 协作提示词、原创鸭鸭素材和视觉验收证据。公开可见不等于授权再利用；仓库未授予素材或代码的再分发许可，使用前请取得权利人许可。线上员工登记数据不在此仓库。

## 代码与目录

| 路径 | 用途 |
| --- | --- |
| `client/`、`server/`、`shared/`、`database/` | 飞书妙搭实际运行的前后端工程；妙搭原提交历史保留在 `main`。 |
| `source/鸭鸭日历.html` | 本地单文件设计与交互源，供继续迭代和对照；**不等于**自动部署入口。 |
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

本仓库的 `main` 保存可追溯的妙搭代码及后续归档提交。要精确取得某个已发布版本的运行代码，请检出相应 Tag；`main` 最新提交还包含归档文档与素材。飞书企业应用的 `1.0.3` 属于另一条版本序列。

## 本地检查

```bash
npm ci
npm run type:check
npm run lint
npm run build:prod
```

`npm ci` 的 `postinstall` 依赖飞书妙搭包与环境；没有相应访问权限时，先查看错误，不要把凭证写入仓库。完整的分支、打标、推送和恢复命令见 [Git 工作流](docs/GIT_WORKFLOW.md)。
