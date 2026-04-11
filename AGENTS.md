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
- **单向依赖**：`core/` 仅依赖 `types/`；`parsers/` 依赖 `types/`；`cli/` 依赖 `core/` 和 `parsers/`

## 敏感文件规范

- `tests/fixtures/local/` — gitignored，存放真实 PDF
- `tests/fixtures/phillip/` — 脱敏 JSON，可入库
- `**/*.pdf` — 全局 gitignored
- **禁止提交含真实姓名或账户号的文件**

## 测试策略

### CI 套件（`npm test` / `npm run test:ci`）

- 运行 `stage2.test.ts` + `cli.test.ts`
- 无需 PDF 文件，使用脱敏 JSON fixtures
- PR 必须通过，解析成功率指标 >= 90%（实际 100%）

### 本地套件（`npm run test:local`）

- 包含 CI 套件 + `stage1.test.ts`
- Stage1 测试需要 `tests/fixtures/local/` 下的真实 PDF
- 如果本地无 PDF，Stage1 测试自动跳过

### Fixture 组织

```
tests/fixtures/
├── local/         # gitignored，放真实 PDF 用于 Stage1 测试
└── phillip/       # 脱敏 JSON fixtures，用于 Stage2 回归测试
    ├── user_a_*/  # 用户 A 的脱敏测试数据
    ├── user_b_*/  # 用户 B 的脱敏测试数据
    └── ...
```

## 新增 Parser 开发规范

### 目录结构

```
src/parsers/<broker-name>/
├── index.ts         # XxxPlugin implements IBrokerPlugin
├── extractor.ts     # Stage1 提取器 implements IStage1Extractor
├── formatter.ts     # Stage2 格式化器 implements IStage2Formatter
└── extract.py       # Python 提取脚本（如需要）
```

### 实现步骤

1. 实现 `IBrokerPlugin` 接口（`detect()` + 工厂方法）
2. 实现 `IStage1Extractor.extract()` — 从 PDF 提取原始表格
3. 实现 `IStage2Formatter.format()` — 将原始数据转为 `StatementData`
4. 在 `src/cli/index.ts` 中注册插件：`registry.register(new XxxPlugin())`
5. 在 `src/index.ts` 中导出插件类
6. 添加脱敏 fixture 到 `tests/fixtures/<broker>/`
7. 在 `tests/stage2.test.ts` 中添加回归测试用例

### 参考实现

辉立证券插件：`src/parsers/phillip/`

## 提交规范

```bash
# type: feat | fix | refactor | test | docs | chore
git commit -m "feat: 新增功能描述"
```
