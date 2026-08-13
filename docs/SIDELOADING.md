# 手机侧载指南（Sideloading Guide）

Midian 未上架社区商店时的安装方式。两种路线：**Obsidian Sync**（最简单）或**手动复制文件**。

## 需要复制的文件

构建产物共 4 个文件（`npm run build` 会生成 / 拷贝）：

```
main.js
manifest.json
styles.css
versions.json
```

## 路线 A：Obsidian Sync（推荐）

1. 桌面端构建后，把 4 个文件放入桌面 Vault 的 `.obsidian/plugins/midian/`（设置 `OBSIDIAN_VAULT` 后构建自动完成）。
2. 确认 Obsidian Sync 开启且「已安装的社区插件」在同步范围内（Sync 设置 → 同步内容 → 第三方插件）。
3. 手机上打开对应 Vault，等待同步，插件自动出现，启用即可。

## 路线 B：Android 手动复制

1. 把 4 个文件传到手机（微信/网盘/USB 均可，注意微信下载的文件可能在 `Download` 里）。
2. 用文件管理器（推荐 Material Files / 系统文件管理器）定位 Vault：
   - 若 Vault 在 `Documents/`（Obsidian 默认）：路径形如 `Documents/<Vault名>/.obsidian/plugins/`
   - `.obsidian` 是隐藏文件夹，需开启「显示隐藏文件」
3. 新建文件夹 `midian`，把 4 个文件放进去。
4. 回到 Obsidian：设置 → 第三方插件 → 启用 Midian。

> 注意：不要放进 `Android/data` 目录（Android 11+ 禁止访问）。若你的 Vault 在可访问的文档目录里，直接复制即可；若在受限目录，换用路线 A 或在 Obsidian 里把 Vault 移动到 `Documents/`。

## 路线 C：iOS 手动复制

iOS 沙盒限制严格，推荐路线 A。无 Sync 时：

1. 打开「文件」App → 确保「我的 iPhone → Obsidian」可见（Obsidian 设置里开启「允许文件访问」）。
2. 把 4 个文件放进 iCloud 或本地某个文件夹。
3. 找到 `<Vault>/.obsidian/plugins/`（隐藏文件夹在文件 App 里默认不显示，需用电脑或第三方工具如 iMazing 操作）。
4. 创建 `midian` 文件夹并放入 4 个文件。
5. 回 Obsidian 启用。

> 最省事的 iOS 方案：在电脑上把文件放进 iCloud Drive 中的 Vault（Obsidian iOS 使用 iCloud Vault 时，`.obsidian` 在 Mac 上可见），然后在 Mac 的 Finder 里完成复制，手机自动同步。

## 验证

- 设置 → 第三方插件 → Midian 应出现在「已安装插件」列表
- 左侧 Ribbon 出现消息图标；设置页「测试连接」能返回结果
- 若插件加载失败：检查是否 4 个文件齐全、`manifest.json` 无 BOM/编码问题、Vault 路径是否正确

## 更新

替换 4 个文件后，在 Obsidian 设置 → 第三方插件 → Midian → 「重新加载」。
