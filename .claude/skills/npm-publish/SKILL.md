---
name: npm-publish
description: 发布 @tcos/broker-parser 新版本到 npm，包含版本号管理、tag 推送和 CI 发布验证
---

## 触发条件

以下情况触发此 Skill：

- 用户提到「发包」「发布」「publish」「release」「新版本」「npm 发布」
- 用户要求升级版本号（patch / minor / major）
- 用户说「上线」「推包」「打 tag」

## Pre-flight 检查

在开始发布前，逐一确认以下条件：

```bash
# 1. 确认在 broker-parser 目录
pwd  # 应为 packages/broker-parser 或独立克隆的根目录

# 2. 工作区干净，无未提交改动
git status

# 3. 测试全绿
npm test

# 4. 本地构建通过
npm run build

# 5. 确认 GitHub Secrets 中 NPM_TOKEN 已配置
gh api repos/biggersun/broker-parser/actions/secrets
# 预期: {"total_count":1,"secrets":[{"name":"NPM_TOKEN",...}]}
```

> **NPM_TOKEN 类型必须是 Automation**
> Classic token 或 Granular token（未勾选 bypass 2fa）会在 CI 报 403。
> 在 https://www.npmjs.com/settings/用户名/tokens 创建时选 **Automation**。

## 发布流程

### 1. 确定新版本号

```bash
# 查看当前版本
node -p "require('./package.json').version"

# 选择恰当的语义化版本类型：
#   patch  → 仅 bug 修复，不新增功能       (0.1.0 → 0.1.1)
#   minor  → 新功能，向后兼容               (0.1.0 → 0.2.0)
#   major  → 破坏性变更                     (0.1.0 → 1.0.0)
npm version patch   # 或 minor / major
```

`npm version` 会自动：

- 修改 `package.json` 中的 version 字段
- 创建一个 git commit（`chore: X.Y.Z`）
- 创建对应的本地 git tag（`vX.Y.Z`）

### 2. 推送 commit 和 tag

```bash
git push && git push origin vX.Y.Z
```

推送 tag 后，`.github/workflows/release.yml` 自动触发：
`npm ci` → `npm run build` → `npm publish --access public`

### 3. 等待并验证

```bash
# 监控 CI 状态（约 20-30 秒）
gh run list --repo biggersun/broker-parser --limit 3

# 确认包已上线
curl -s https://registry.npmjs.org/@tcos/broker-parser | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d['dist-tags']['latest'])"
```

## 处理已存在的 tag

如果 tag 已推送但 CI 失败，需要删旧 tag 重建：

```bash
# 删除远端 + 本地旧 tag
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z

# 重建 tag 指向当前最新 commit
git tag vX.Y.Z HEAD
git push origin vX.Y.Z
```

## 发布后：更新 submodule 指针

broker-parser 以 git submodule 挂载在 auto-tax 主仓库。发布后同步更新指针：

```bash
cd /Users/sunxiaoxu/workspace/auto-tax
git add packages/broker-parser
git commit -m "chore: 更新 broker-parser submodule 到 vX.Y.Z"
git push
```

## 常见失败原因

| 错误信息                                                    | 原因                       | 解决方法                                              |
| ----------------------------------------------------------- | -------------------------- | ----------------------------------------------------- |
| `NODE_AUTH_TOKEN:` 为空                                     | GitHub Secret 未配置       | 去 repo Settings → Secrets → Actions 添加 `NPM_TOKEN` |
| `403 Two-factor authentication required`                    | token 类型不是 Automation  | 重新生成 Automation 类型 token 并更新 Secret          |
| `tag 'vX.Y.Z' already exists`                               | 本地 tag 残留              | `git tag -d vX.Y.Z` 先删本地再重建                    |
| `You cannot publish over the previously published versions` | npm 版本号与已发布版本重复 | `npm version patch` 升一个版本号再发                  |
