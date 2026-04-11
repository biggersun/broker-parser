# @tcos/broker-parser

> English reference page. The primary documentation is maintained in Chinese.

[![CI](https://github.com/biggersun/broker-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/biggersun/broker-parser/actions)
[![npm](https://img.shields.io/npm/v/@tcos/broker-parser)](https://www.npmjs.com/package/@tcos/broker-parser)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Primary documentation: [README.md](./README.md)

## What this package does

`@tcos/broker-parser` parses brokerage PDF statements into structured JSON.

Current support:

- Phillip Securities

Usage modes:

- CLI
- npm package
- AI skill for Claude Code, Codex, and OpenClaw

## Recommended setup

For full details, troubleshooting, environment compatibility, and upgrade notes, see the Chinese README:

- [安装与环境说明](./README.md#运行环境要求)
- [Skill 安装详解](./README.md#skill-安装详解)
- [常见问题](./README.md#常见问题)
- [方案评审结论](./README.md#方案评审结论)

Typical commands:

```bash
npx @tcos/broker-parser setup
npx @tcos/broker-parser install-skill
```

CLI example:

```bash
npm install -g @tcos/broker-parser
tcos-parse statement.pdf
```

SDK example:

```typescript
import { ParsePipeline, PhillipPlugin, PluginRegistry } from '@tcos/broker-parser';

const registry = new PluginRegistry();
registry.register(new PhillipPlugin());

const pipeline = new ParsePipeline(registry);
const result = await pipeline.parse('./statement.pdf');

console.log(result.data);
```

## Notes

- The Chinese README is the source of truth.
- The English file is intentionally brief to avoid documentation drift.
- If any detail differs, follow [README.md](./README.md).
