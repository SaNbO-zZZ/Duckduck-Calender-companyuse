# 本次 GitHub 迁移记录（2026-10-21）

这是一份**已执行操作的复核清单**，不是要求重新运行的初始化脚本。来源为本机飞书妙搭 Git 工程和鸭鸭日历本地归档；GitHub 目标是私有仓库 `SaNbO-zZZ/Duckduck-Calender-companyuse`。

## 1. 保留真实发布历史

```bash
git clone --no-hardlinks --branch sprint/default \
  /Users/xz/Sanbo/Codex/Company/company_use_calendar/deployment/duck-calendar-runtime \
  /Users/xz/GitHub/Local/Duckduck-Calender-companyuse
cd /Users/xz/GitHub/Local/Duckduck-Calender-companyuse
git remote remove origin                    # 去掉指向本机源目录的临时 remote
git branch -m main                          # 原 sprint/default 的提交链成为 main
git log --reverse --oneline                 # 核对妙搭原始提交顺序
```

原始发布链上的 `5ffb32d`、`480d5b7`、`2439206`、`b10c269`、`6c8c196`、`6653ab0`、`8331e9a` 的 SHA 均保留。已发布提交中有些消息不是 Conventional Commits；为了不破坏 SHA 与飞书发布记录的对应关系，没有改写旧提交。

## 2. 整理当前快照，而非改写旧历史

```bash
git rm -r --cached -- .agents .claude .env .npmrc
git add .gitignore .env.example
git commit -m 'chore(repo): ignore local state and remove generated tooling'

# 按真实存在的文件归档，不给缺失的 1.x/2.x 版本伪造提交。
git add source archive/local-history archive/claude-prompts archive/local-tests archive/local-tooling
git commit -m 'docs(archive): preserve Claude-era source and local review history'

git add .gitattributes assets archive/visual-review
git commit -m 'chore(assets): preserve duck artwork and weather review evidence'

git add README.md docs/engineering docs/figures docs/GIT_WORKFLOW.md docs/VERSION_HISTORY.md
git commit -m 'docs: map release provenance and recovery workflow'

git add .github docs/RELEASE_CHECKLIST.md
git commit -m 'docs: add review and release checklists'
```

本迁移记录是发布后补充的操作复盘。原始素材 ZIP 是解压目录的重复副本，因此只提交解压后的 24 款源素材；`node_modules/`、`dist/`、日志、`.env.local`、原始会话资料及授权文件未上传。原妙搭历史里的 `.env` 只有本地日志开关，但当前工作树已移除并加入忽略规则。

## 3. Tag 指向发布提交

```bash
git tag -a v3.0.1 5ffb32d -m 'initial all-staff deployment'
git tag -a v3.0.2 480d5b7 -m 'first real registration repair'
git tag -a v3.0.3 2439206 -m 'notification identity repair'
git tag -a v3.0.4 b10c269 -m 'selectable arrival date'
git tag -a v3.0.5 6c8c196 -m 'registration and notification latency'
git tag -a v3.0.6 6653ab0 -m 'business trip notice'
git tag -a v3.1.0 8331e9a -m 'Hefei observation weather trial'
```

本次实际 Tag 注释还记录了对应妙搭 release ID。`v3.0.0` 及更早阶段只有本地材料，没有可证明的完整发布快照，因此没有给它们打冒充稳定发布的 Tag。

## 4. 创建私有远端并核对

```bash
gh repo create SaNbO-zZZ/Duckduck-Calender-companyuse --private --source . --remote origin
git push -u origin main
git push origin --tags
gh repo view SaNbO-zZZ/Duckduck-Calender-companyuse \
  --json visibility,defaultBranchRef,url
git ls-remote --heads --tags origin
```

核对结果：仓库为 `PRIVATE`、默认分支为 `main`，七个稳定 Tag 均已推送。GitHub 不会自动部署飞书应用；未来代码提交、妙搭发布与 Tag 三件事应分别验证。
