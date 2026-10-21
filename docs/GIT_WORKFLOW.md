# Git 工作流与恢复命令

本仓库是私有仓库。`main` 只接收可审查的稳定变更；新功能从短生命周期分支开发，经过检查与 PR 合并。飞书妙搭的发布动作仍在飞书进行，GitHub 推送本身不会更新企业应用。

## 日常开发

```bash
git switch main                         # 从稳定分支开始
git pull --ff-only origin main          # 只接受快进，避免意外合并提交
git switch -c feature/weather-preview  # 破坏性或实验性功能放在独立分支

# 编辑并运行相应检查后：
git add client server shared tests
git diff --cached --check               # 检查空白与补丁格式
git diff --cached --stat                # 核对提交范围
git commit -m "feat(weather): add preview controls"
git push -u origin feature/weather-preview
gh pr create --base main --head feature/weather-preview --fill
```

持续集成分支如确有需要，可用 `git switch -c dev main` 建立；仍应通过 PR 合回 `main`，不要把未审查的实验直接推送到稳定分支。提交使用 `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `chore:` 等 Conventional Commits。原妙搭历史中已有少量非规范消息，为保持发布记录的 SHA 不变，**不重写这些已发布提交**。

## 发布与 Tag

只有飞书发布、回读与必要测试都完成后，才对对应提交打稳定 Tag：

```bash
git tag -a v3.1.1 <已发布的提交SHA> -m "v3.1.1: 简述发布内容"
git push origin v3.1.1
git show --no-patch --decorate v3.1.1
```

`main` 可能比最新应用发布多出文档归档提交，因此 Tag 应指向**实际发布提交**，不能机械地用 `HEAD`。

## 灾难恢复

```bash
git switch --detach v3.0.4                    # 只读查看旧版完整工程；不改 main
git switch -c hotfix/from-v3.0.4 v3.0.4      # 从旧版快照拉修复分支
git switch main && git revert <错误提交SHA>   # 保留历史地撤销已推送改动
```

修复分支完成后推送并通过 PR 合回。不要在共享的 `main` 上 `reset --hard` 后强制推送。需要单独恢复某文件时使用 `git restore --source=v3.0.4 -- path/to/file`，核对差异后再提交。

## 提交前检查

```bash
git status --short
git check-ignore -v .env .env.local node_modules dist logs
git ls-files | rg '(^|/)(\.env|node_modules|dist|logs)(/|$)' || true
git diff --cached --check
```

`.gitignore` 只阻止**新文件**被加入；历史上曾被跟踪的配置需先 `git rm --cached`。原妙搭历史中的 `.env` 已核实仅含非机密的本地日志开关，但当前快照已移除；若未来要将仓库公开，仍需重新审查全部历史与素材授权。
