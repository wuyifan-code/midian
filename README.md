# Midian

[![CI](https://github.com/wuyifan-code/midian/actions/workflows/ci.yml/badge.svg)](https://github.com/wuyifan-code/midian/actions)

轻量、移动端优先的 Obsidian AI 工作空间插件。灵感来自 [Claudian Plus](https://github.com/wuyifan-code/Claudian-plus)，但为手机而生：无子进程、直连 HTTP API、流式输出，对话、记忆与工具全部留在 Vault 本地。

A lightweight, mobile-first AI workspace for Obsidian, inspired by Claudian Plus but built for phones: no subprocesses, direct HTTP APIs, streaming output; conversations, memory, and tools all live in your vault.

## 特性

- **双 Provider**：Claude（Anthropic 原生协议）+ OpenAI 兼容端点（Kimi / DeepSeek / MiniMax / GLM / Qwen…）
- **流式输出**：SSE 流式渲染；CORS 受限时自动降级为 `requestUrl` 非流式（移动端可用）
- **Vault 工具**：`read_note` / `write_note` / `append_note` / `search_notes` / `list_folder` / `get_properties` / `update_properties` / `ask_user`
  - 双协议 tool-call（Anthropic tool_use + OpenAI function calling）
  - 写入类操作需要逐次批准，可「本次会话始终允许」；拒绝与失败都有明确反馈
  - `ask_user`：AI 在任务中途向你提问（含预设选项与自由输入），在聊天内直接作答
- **笔记上下文**：`@笔记` 提及（搜索选择器）、当前笔记 / 选中文本自动附带、上下文预算截断
- **图片输入**：从 Vault 选择图片随消息发送（Anthropic 原生 image 块 / OpenAI 兼容 image_url，支持 png/jpg/webp/gif）
- **斜杠命令**：输入 `/` 呼出命令菜单（总结 / 改写 / 翻译 / 解释 / 继续 / 头脑风暴），上下键选择、Enter 确认
- **记忆引擎**：对话结束后后台蒸馏要点存入 `.midian/memory/`，积累后合并为长期画像，注入后续对话（可关闭、可指定便宜模型）
- **会话管理**：历史搜索（标题/模型/消息内容全文）、复制（fork）、回退上一轮（rewind）、删除、自动命名、点击标题重命名、**导出对话为笔记**（含图片嵌入与思考过程）
- **消息编辑**：点铅笔图标把最后一条用户消息取回输入框，改完重发
- **自动标题**：首轮对话结束后用模型生成简短标题（可回退为手动）
- **模型切换器**：聊天头部一键切换模型与 Provider，或输入自定义模型名
- **代码块一键复制**：AI 输出的代码块悬停/常显复制按钮
- **欢迎页**：未配置 API Key 时引导打开设置；显示最近对话快捷入口
- **快捷命令**：命令面板「总结/改写/翻译当前笔记」一键带模板打开
- **系统集成**：文件右键菜单「在 Midian 中讨论此笔记」、编辑器菜单「发送选中文本到 Midian」
- **长对话保护**：历史消息上限自动裁剪上下文，超出窗口也不崩
- **连接测试**：设置页一键测试 API Key 与端点（移动端排障友好）
- **思考块折叠**：支持 Anthropic thinking 与 `reasoning_content`（DeepSeek / Kimi 风格）
- **Persona**：自定义系统提示词
- **i18n**：简体中文 / English（跟随系统或手动切换）
- **移动端适配**：全屏视图、大触控目标、安全区适配、Enter 直接发送（IME 安全）

## 为什么是它

Obsidian 桌面端的 AI 插件几乎都依赖本地 CLI（Codex、Claude Code、Kimi CLI），这些在手机 WebView 里全部无法运行。Midian 把 Claude / OpenAI 兼容 API 直接搬进手机：不需要电脑在后台，不需要终端，AI 可以直接读、搜、写你的 Vault（写入需批准），并记得你们聊过什么。

## 安装（手动 / 开发）

1. 构建插件：

   ```bash
   npm ci
   npm run build
   ```

   设置 `OBSIDIAN_VAULT` 环境变量可自动拷贝到 Vault 插件目录。

2. 将 `main.js`、`manifest.json`、`styles.css`、`versions.json` 放入 `<vault>/.obsidian/plugins/midian/`。

3. **移动端**：通过 Obsidian Sync 同步插件文件夹，或直接把四个文件复制到手机 Vault 的对应目录。详细步骤（Android/iOS 手把手）见 [docs/SIDELOADING.md](docs/SIDELOADING.md)。

4. Obsidian「设置 → 第三方插件」启用 Midian。

## 配置

设置 → Midian：

| 分组 | 说明 |
| --- | --- |
| Provider | Claude 或 OpenAI 兼容；API Key、Base URL、模型、Max Tokens |
| Persona | 自定义系统提示词，留空用默认 |
| 笔记上下文 | 默认附带当前笔记、选区优先、上下文预算 |
| Vault 工具 | 开关工具调用 |
| 记忆 | 开关记忆引擎、记忆模型 |

OpenAI 兼容端点示例：`https://api.moonshot.cn/v1`（Kimi）、`https://api.deepseek.com`（DeepSeek）。

## 开发

```bash
npm run dev         # watch 构建（配合 OBSIDIAN_VAULT 自动拷贝）
npm run typecheck
npm test            # node:test 单测（SSE 解析、frontmatter、上下文预算、i18n）
npm run build       # 生产构建（minify，~73KB）
```

## 移动端验证清单

- [ ] 启动后点击 Ribbon 图标打开全屏聊天视图
- [ ] Claude 端点流式输出（Anthropic 支持浏览器直连）
- [ ] OpenAI 兼容端点：流式失败时自动降级非流式
- [ ] 工具调用：读取自动执行，写入弹出批准卡片；`ask_user` 提问卡片可作答
- [ ] 图片附件：选择 Vault 图片随消息发送（含纯图片消息）
- [ ] 斜杠命令：输入 `/` 呼出菜单并选择
- [ ] 模型切换器：头部切换模型 / Provider / 自定义模型
- [ ] 编辑并重发最后一条消息；首轮后自动生成标题
- [ ] 思考块显示与折叠
- [ ] 会话历史搜索（含消息内容）、复制、回退、删除、重命名、导出
- [ ] 文件菜单「在 Midian 中讨论」与编辑器菜单「发送选中文本」
- [ ] 记忆引擎：聊完后 `.midian/memory/` 出现要点
- [ ] 断网 / 杀进程后历史仍在

## 许可

MIT。全新代码实现，仅借鉴 Claudian Plus 的会话存储与交互概念，不含其源码。
