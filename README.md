# @tcos/broker-parser

> 将券商 PDF 结单解析为结构化 JSON

[![CI](https://github.com/biggersun/broker-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/biggersun/broker-parser/actions)
[![npm](https://img.shields.io/npm/v/@tcos/broker-parser)](https://www.npmjs.com/package/@tcos/broker-parser)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

English reference: [README.en.md](./README.en.md)

`@tcos/broker-parser` 目前支持 3 种使用方式：

- `CLI`：直接在命令行解析 PDF
- `npm package`：在你自己的 Node.js / TypeScript 项目中集成解析能力
- `AI Skill`：为 Claude Code、Codex、OpenClaw 安装 `/parse-statement`

## 支持的券商

| 券商                           | 状态   |
| ------------------------------ | ------ |
| 辉立证券（Phillip Securities） | 已支持 |

## 运行环境要求

当前版本主要面向类 Unix 环境：

- macOS + Homebrew
- Ubuntu / Debian + `apt-get`
- 其他 Linux 发行版：如果系统里已经有 `python3`、`pip`、`pdftotext`，也可以使用

运行时依赖：

- Node.js 18+
- Python 3.8+
- Python 包：`pdfplumber`
- `poppler` 提供的 `pdftotext`

内置的 `setup` 命令会在 macOS 和 Ubuntu/Debian 上自动安装或校验这些依赖。其他系统不会强行猜测包管理器，而是提示你手动补齐。

## 快速开始

### 1. 命令行直接解析

```bash
npm install -g @tcos/broker-parser
tcos-parse statement.pdf
```

输出到文件：

```bash
tcos-parse statement.pdf -o result.json
```

### 2. 作为 AI Skill 安装

如果你希望在 Agent 里直接使用 `/parse-statement`，推荐按下面顺序执行：

```bash
npx @tcos/broker-parser setup
npx @tcos/broker-parser install-skill
```

这两步的职责不同：

1. `setup`
   - 安装或检查 `tcos-parse`
   - 安装或检查 `python3`
   - 安装或检查 `pip`
   - 安装或检查 `pdfplumber`
   - 安装或检查 `pdftotext` / `poppler`
2. `install-skill`
   - 将 `parse-statement` skill 安装到 Agent 可发现的目录
   - Claude Code：`~/.claude/skills/parse-statement`
   - Codex / OpenClaw：`~/.agents/skills/parse-statement`

安装完成后，重新打开一个新的 Agent 会话，然后可以直接说：

- `帮我解析这个券商 PDF 结单`
- `读取这个辉立证券结单并返回 JSON`
- `从这个 PDF 提取交易记录、持仓和账户汇总`

### 3. 作为 npm 包使用

```typescript
import { ParsePipeline, PhillipPlugin, PluginRegistry } from '@tcos/broker-parser';

const registry = new PluginRegistry();
registry.register(new PhillipPlugin());

const pipeline = new ParsePipeline(registry);
const result = await pipeline.parse('./statement.pdf');

console.log(result.data);
```

## Skill 安装详解

### 第一步：`setup`

```bash
npx @tcos/broker-parser setup
```

这个命令会做什么：

1. 检查 `PATH` 里是否已经有 `tcos-parse`
2. 如果没有，执行 `npm install -g @tcos/broker-parser`
3. 检查是否存在 `python3`
4. 如果没有：
   - macOS：执行 `brew install python3`
   - Ubuntu / Debian：执行 `sudo apt-get install -y python3 python3-pip`
5. 检查 `python3 -m pip` 是否可用
6. 如果不可用，执行 `python3 -m ensurepip --upgrade`
7. 检查是否能导入 `pdfplumber`
8. 如果没有，执行 `python3 -m pip install --user pdfplumber`
9. 检查是否存在 `pdftotext`
10. 如果没有：
    - macOS：执行 `brew install poppler`
    - Ubuntu / Debian：执行 `sudo apt-get install -y poppler-utils`

适合的环境：

- 个人 macOS 开发机器
- Ubuntu / Debian 开发机或云主机
- 允许使用 `brew` / `apt-get` / `sudo` 的 shell 环境

不太适合的环境：

- 企业受限机器
- 没有系统包管理器的极简容器
- Windows 原生环境

可能的副作用：

- 会全局安装 `@tcos/broker-parser`
- 在 Linux 上可能触发 `sudo` 提示
- 会把 `pdfplumber` 安装到当前用户的 Python 用户目录
- 可能升级你的系统 Python / poppler 包版本

可选参数：

- `--dry-run`：只展示即将执行的动作，不真正执行

示例：

```bash
npx @tcos/broker-parser setup --dry-run
tcos-parse setup
```

建议先用 `--dry-run` 的情况：

- 共享机器
- CI / Docker 环境
- 你想先确认它到底会执行哪些安装命令

### 第二步：`install-skill`

```bash
npx @tcos/broker-parser install-skill
```

这个命令会做什么：

1. 找到 `@tcos/broker-parser` 包内自带的 `parse-statement` skill
2. 自动探测宿主目录：
   - Claude Code -> `~/.claude/skills`
   - Codex / OpenClaw -> `~/.agents/skills`
3. 将 skill 复制到对应目录
4. 写入一个小的 manifest 文件，用于后续识别该目录是否由 broker-parser 安装
5. 如果检测到相同版本已经安装，会直接跳过

适合的环境：

- 本地开发机器
- 你拥有 `~/.claude` 或 `~/.agents` 写权限的环境
- 可以方便重启 Agent 会话的环境

可能的副作用：

- 会创建或更新 `~/.claude/skills/parse-statement`
- 会创建或更新 `~/.agents/skills/parse-statement`
- 不会自动重启你的 Agent 会话
- 加上 `--force` 时，会先删除旧目录再覆盖安装

可选参数：

- `--host auto`：自动探测宿主，默认值
- `--host claude`：只安装 Claude Code 版本
- `--host agents`：只安装 Codex / OpenClaw 版本
- `--dry-run`：只展示安装计划，不真正写文件
- `--force`：覆盖已有冲突目录

示例：

```bash
npx @tcos/broker-parser install-skill --host claude
npx @tcos/broker-parser install-skill --host agents
npx @tcos/broker-parser install-skill --dry-run
```

一行完成首次安装：

```bash
npx @tcos/broker-parser setup && npx @tcos/broker-parser install-skill
```

适合直接用这一行的情况：

- 新机器首次安装
- 你只想要最短可复制命令

不建议直接一行跑的情况：

- 你想先审查 setup 会执行哪些命令
- 当前机器是共享环境或受限环境
- 你只想刷新 skill，不想动系统运行时

### 升级与重装

推荐升级流程：

```bash
npm install -g @tcos/broker-parser@latest
tcos-parse setup
tcos-parse install-skill --force
```

为什么升级后建议再跑一次 `install-skill --force`：

- 当前 skill 安装方式是“复制目录”，不是软链
- 这样可以避免 `npx` 临时缓存路径失效
- 但这也意味着升级 npm 包后，旧的 skill 目录不会自动覆盖

如果你只升级了 CLI，不在意 skill 文案或 prompt 版本，也可以跳过 `install-skill --force`

### 手动 fallback

如果你明确想要用软链，而不是复制目录，可以手动这样做：

```bash
npm install -g @tcos/broker-parser
mkdir -p ~/.claude/skills ~/.agents/skills
ln -sfn "$(npm root -g)/@tcos/broker-parser/.claude/skills/parse-statement" ~/.claude/skills/parse-statement
ln -sfn "$(npm root -g)/@tcos/broker-parser/.claude/skills/parse-statement" ~/.agents/skills/parse-statement
```

只有在这些情况下才推荐手动软链：

- 你明确想保持 skill 与全局 npm 包目录同步
- 你正在本地调试 skill 文件
- 你确认全局 npm 安装路径是稳定的

如果你主要依赖 `npx @tcos/broker-parser ...`，不建议手动软链，因为 `npx` 可能来自临时缓存目录。

## 环境适配建议

| 环境                        | `setup`    | `install-skill` | 建议                      |
| --------------------------- | ---------- | --------------- | ------------------------- |
| macOS + Homebrew            | 完整支持   | 完整支持        | 最佳体验                  |
| Ubuntu / Debian + `apt-get` | 完整支持   | 完整支持        | 最佳体验                  |
| 其他 Linux 发行版           | 部分支持   | 完整支持        | 先手动补 Python / poppler |
| sudo 受限的远程主机         | 部分支持   | 通常可用        | 先跑 `setup --dry-run`    |
| CI / Docker 镜像            | 部分支持   | 通常没必要      | 更建议把依赖烘焙进镜像    |
| Windows 原生环境            | 未正式支持 | 不确定          | 如有需要建议使用 WSL      |

## 常见问题

### `setup` 过程中要求输入 `sudo`

这是预期行为。Ubuntu / Debian 上如果缺少 `python3` 或 `poppler-utils`，会通过 `sudo apt-get` 安装。

如果当前机器没有 sudo 权限：

- 先手动安装这些系统依赖
- 再重新执行 `tcos-parse setup`

### `setup` 提示需要手动安装依赖

说明当前系统既没有 `brew`，也没有 `apt-get`。此时需要你手动补齐：

- `python3`
- `python3 -m pip`
- `python3 -m pip install --user pdfplumber`
- `pdftotext` / `poppler`

补齐后再跑一次 `tcos-parse setup`。

### `install-skill` 提示没有检测到支持的宿主

常见原因：

- Claude / Codex / OpenClaw 还没安装
- 宿主命令不在 `PATH`
- `~/.claude` 或 `~/.agents` 目录还没创建

这时可以显式指定：

```bash
tcos-parse install-skill --host claude
tcos-parse install-skill --host agents
```

### `install-skill` 提示目标目录已存在

这表示 broker-parser 默认不会覆盖已有目录，以免误删你自己的 skill 内容。

确认可以覆盖后，执行：

```bash
tcos-parse install-skill --force
```

### 安装后 skill 没有立即生效

这通常不是安装失败，而是 Agent 进程还没重新扫描 skill 目录。

做法：

- 关闭当前会话
- 新开一个 Claude / Codex / OpenClaw 会话
- 再尝试调用 `/parse-statement`

## 方案评审结论

当前方案整体可用，没有明显阻塞问题，但边界需要明确：

- `setup` 只对 `brew` 和 `apt-get` 做了自动化支持，其他 Linux 发行版依然以手动安装为主
- `install-skill` 的宿主探测是保守策略；探测失败时需要用户手动指定 `--host`
- skill 目录使用复制而不是软链，优点是不会因 `npx` 临时路径失效；代价是升级后需要显式 `--force` 刷新
- 当前流程默认用户拥有自己 home 目录的写权限，不适合受严格权限控制的多用户共享系统

## CLI 命令参考

| 命令                                  | 说明                          |
| ------------------------------------- | ----------------------------- |
| `tcos-parse <pdf>`                    | 解析 PDF，输出 JSON 到 stdout |
| `tcos-parse <pdf> -o out.json`        | 输出到文件                    |
| `tcos-parse <pdf> --raw`              | 只输出 Stage1 原始数据        |
| `tcos-parse <pdf> --no-clean`         | 跳过 Stage3 清理              |
| `tcos-parse <pdf> -b phillip`         | 指定券商，跳过自动检测        |
| `tcos-parse --detect <pdf>`           | 检测 PDF 属于哪个券商         |
| `tcos-parse --list-parsers`           | 列出支持的券商解析器          |
| `tcos-parse <pdf> -v`                 | 在 stderr 输出阶段耗时        |
| `tcos-parse <pdf> -q`                 | 静默模式，只输出 JSON         |
| `tcos-parse setup`                    | 安装 / 检查运行时依赖         |
| `tcos-parse setup --dry-run`          | 预览 setup 将执行的动作       |
| `tcos-parse install-skill`            | 安装 `/parse-statement` skill |
| `tcos-parse install-skill --dry-run`  | 预览 skill 安装目标           |
| `tcos-parse install-skill --force`    | 覆盖已有冲突目录              |
| `tcos-parse install-skill --host ...` | 只安装到指定宿主              |

## 解析流程

```text
PDF File
    |
  Stage1: Extract (pdfplumber)
    |  -> RawTableData
    |
  Stage2: Format (rule engine)
    |  -> StatementData
    |
  Stage3: Clean (dedup, normalize)
    |  -> StatementData (cleaned)
    v
  JSON Output
```

## 输出格式

```json
{
  "accountCode": "M000001",
  "clientName": "USER A",
  "statementDate": "2024-01-31",
  "transactions": [
    {
      "transactionDate": "2024-01-15",
      "stockCode": "1234",
      "stockName": "EXAMPLE CO",
      "transactionType": "BUY",
      "quantity": 1000,
      "price": 12.34,
      "amount": -12340,
      "currency": "HKD"
    }
  ],
  "ipo": [],
  "snapshots": [
    {
      "symbol": "HKD",
      "assetCategory": "Cash",
      "quantity": 50000,
      "currency": "HKD"
    }
  ]
}
```

关键类型：

- `StatementData`：完整结单结果
- `TradeData`：单条交易记录
- `IPOData`：IPO 申购 / 分配记录
- `SnapshotData`：持仓快照

## 新增券商解析器

新增券商插件的实现方式见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 开发

```bash
npm install
npm test
npm run test:local
npm run lint
npm run format:check
npm run typecheck
npm run build
```

## License

MIT
