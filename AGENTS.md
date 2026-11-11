# 鸭鸭日历工作区规则

每次开始处理本工作区前，先读取 [`docs/鸭鸭日历工作主文档.md`](docs/鸭鸭日历工作主文档.md)。它是项目状态、迁移记录、GitHub、飞书文档和更新约定的索引。

完成任何鸭鸭日历相关工作后：

1. 更新 `docs/鸭鸭日历工作主文档.md` 的当前状态和更新日志；需要发布版本时同步更新 `docs/VERSION_HISTORY.md` 或对应工程记录。
2. 用同一份内容更新工作主文档 DOCX `docs/鸭鸭日历工作主文档.docx`，并按文档技能要求渲染检查。
3. 将对应摘要和链接更新到同一份飞书文档：<https://ycn3zdw6f1p7.feishu.cn/wiki/I6uzWnwd7izfPCkQHJDcoxdRnRb>。
4. 在本仓库完成测试、提交并推送到 `origin`：<https://github.com/SaNbO-zZZ/Duckduck-Calender-companyuse>。涉及线上发布时，保留妙搭 release、提交和验证结果。

不要把飞书 token、员工名单、环境变量、授权文件或 `node_modules` 提交到 Git。`session-archive/` 是从旧会话迁移的本地完整资料归档，默认不纳入 Git；需要引用时直接读取其中内容。
