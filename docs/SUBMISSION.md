# 社区插件商店提交指南（Community Plugin Submission）

目标：把 Midian 提交到 [obsidian-releases](https://github.com/obsidianmd/obsidian-releases) 社区插件列表。

## 前置条件自查（全部满足才能提交）

- [ ] 仓库公开：`https://github.com/wuyifan-code/midian`（公开后复检）
- [ ] 最近一次 Release（`v*` 标签）已生成且包含 4 个文件：`main.js` / `manifest.json` / `styles.css` / `versions.json`
- [ ] `manifest.json` 字段齐全且合法：`id`、`name`、`version`、`minAppVersion`、`description`、`author`、`isDesktopOnly: false`
- [ ] `versions.json` 包含每个已发布版本
- [ ] 仓库含 `LICENSE`（MIT）
- [ ] README 含安装 / 配置 / 使用说明
- [ ] 代码通过 Obsidian 审查红线：无 `eval`、无远程代码执行、无混淆、无 Node-only API、不破坏用户数据
- [ ] 真机（Android/iOS）按 `docs/MOBILE_TESTING.md` 跑过一遍，无阻塞问题

## 提交内容

在 `obsidian-releases/community-plugins.json` 的列表末尾追加一行：

```json
{
  "id": "midian",
  "name": "Midian",
  "author": "wuyifan-code",
  "description": "A lightweight mobile-first AI chat workspace. Streams Claude and OpenAI-compatible models over HTTP; sessions stay in your vault.",
  "repo": "wuyifan-code/midian"
}
```

## 操作步骤（gh CLI，已认证）

```bash
# 1. fork + 分支
gh repo fork obsidianmd/obsidian-releases --clone
cd obsidian-releases
git checkout -b add-midian

# 2. 编辑 community-plugins.json，追加上述条目（保持字母序/末尾均可）

# 3. 提交 + 推送 + 开 PR
git add community-plugins.json
git commit -m "Add Midian plugin"
git push origin add-midian
gh pr create --repo obsidianmd/obsidian-releases \
  --title "Add Midian plugin" \
  --body "Midian is a lightweight, mobile-first AI chat workspace for Obsidian (Claude + OpenAI-compatible, streaming, vault tools, memory, sessions in vault)." 
```

## 审查要点（供 PR 描述参考）

- 全新代码实现，仅借鉴 Claudian Plus 的会话存储与交互概念（MIT，无源码复制）
- 移动端优先：无子进程 / 无 home 目录 / 无 Node-only API，全部 Vault 内存储
- 写入类工具逐次批准；`ask_user` 由 UI 拦截
- 100+ 单元 / 集成 / 冒烟 / 对话流测试 + CI（typecheck / test / build）- 红线自检（已扫描通过）：源码与产物无 `eval` / `new Function` / `innerHTML` / `child_process` / `require('fs')` / `process.` / electron；产物仅 `require("obsidian")`
- 发布流程：tag → GitHub Actions → Release（BRAT 可用）

## 提交后

- 关注 PR 评论，按 reviewer 要求修改（通常 1-2 轮）
- 合并后插件出现在社区列表；后续版本更新：改 `manifest.json` 版本 + 打 tag 即可
