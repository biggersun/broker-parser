# AGENTS.md — broker-parser

本文件为 AI Agent 提供此仓库的操作规范。

## Code Review 规范

**所有 code review 请求必须通过 `/codex-review` skill 处理。**

以下请求都应触发 `/codex-review`（使用 Skill 工具调用）：

- "review my code" / "帮我 review 代码"
- "code review" / "代码审查"
- "check my changes" / "检查我的改动"
- 任何明确要求 review、审查、检查代码质量的请求

禁止在未调用 `/codex-review` skill 的情况下自行做 code review。

## 验证命令

```bash
npm run lint          # ESLint 检查
npm run format:check  # Prettier 格式检查
npm run typecheck     # TypeScript 类型检查
npm run test          # 运行 CI suite（Stage2 + CLI，无 PDF 依赖）
npm run test:local    # 运行完整测试（含 Stage1，需本地 PDF）
npm run build         # 构建 dist/
```

## 架构约束（强制）

- **零数据库依赖**：禁止引用 `prisma`、`pg`、`sequelize`、`typeorm`
- **零 Python 依赖（除 extract.py）**：Python 脚本仅限 `src/parsers/phillip/extract.py`，TypeScript 层通过 `child_process.spawn` 调用
- **严格类型**：禁止 `any`，`strict: true`
- **CLI 隔离**：`src/cli/` 只作为 CLI 入口，不被 `src/core/` 或 `src/parsers/` 引用

## 敏感文件规范

- `tests/fixtures/local/` — gitignored，存放真实 PDF
- `tests/fixtures/phillip/` — 脱敏 JSON，可入库
- `**/*.pdf` — 全局 gitignored

## 提交规范

```bash
# type: feat | fix | refactor | test | docs | chore
git commit -m "feat: 新增功能描述"
```
