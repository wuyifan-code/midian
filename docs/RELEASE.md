# 发布流程（Release Process）

发布 = 打 tag，其余全自动。

## 步骤

1. **改版本号**（三处一致）：
   - `manifest.json` → `version`
   - `package.json` → `version`
   - `versions.json` → 追加 `"新版本": "1.8.0"`（`1.8.0` 是 minAppVersion，若提升也要同步改 manifest）
2. **更新 `CHANGELOG.md`**，在顶部加一节。
3. **本地验证**：`npm run typecheck && npm test && npm run build`
4. **提交并打 tag**：

   ```bash
   git add -A
   git commit -m "feat: v0.7.6 - <summary>"
   git tag v0.7.6
   git push && git push --tags
   ```

5. **确认发布**（约 40 秒后）：

   ```bash
   gh run list --workflow release.yml --limit 1
   gh release view v0.7.6
   ```

   Release 工作流会跑完整检查并上传 `main.js` / `manifest.json` / `styles.css` / `versions.json` 四个文件。

## 版本号语义

- `x.y.z`：特性 / 修复 / 文档测试等任意改动均 +1 patch（当前阶段）；进入社区商店稳定期后可改语义化版本

## 用户如何更新

- **BRAT 用户**：`BRAT: Check for updates`
- **手动侧载**：替换插件目录 4 个文件后「重新加载」插件
- **社区商店（未来）**：合并后自动检测

## 真机同步（开发时）

```bash
OBSIDIAN_VAULT="D:\Obsidian\Creative Vault" npm run build
# 然后在 Obsidian 里 设置 → 第三方插件 → Midian → 重新加载
```
