# Contributing to broker-parser

感谢你对 broker-parser 的贡献!

## Development Setup

```bash
# Clone the repo
git clone https://github.com/biggersun/broker-parser.git
cd broker-parser

# Install dependencies
npm install

# Run tests
npm test
```

## Development Workflow

1. Fork the repo and create a feature branch
2. Write code and tests
3. Ensure all checks pass:
   ```bash
   npm run typecheck
   npm run lint
   npm run format:check
   npm run test:ci
   ```
4. Submit a PR

## Fixture Sanitization Rules

Before adding new fixtures to `tests/fixtures/phillip/`, you **must** sanitize all personal data:

| Original Value          | Replace With                   |
| ----------------------- | ------------------------------ |
| Real names              | USER A / USER B / USER C / ... |
| Account M596241         | M000001                        |
| Account M503022         | M000002                        |
| Other real accounts     | M000003, M000004, ...          |
| HKID / passport numbers | Remove entirely                |

**Never commit files containing real names or account numbers.**

All PDF files are globally excluded via `.gitignore`.

## Adding a New Broker Parser

### 1. Create the Plugin Directory

```
src/parsers/<broker-name>/
├── index.ts         # XxxPlugin implements IBrokerPlugin
├── extractor.ts     # Stage1 extractor (IStage1Extractor)
├── formatter.ts     # Stage2 formatter (IStage2Formatter)
└── extract.py       # Python extraction script (if needed)
```

### 2. Implement IBrokerPlugin

```typescript
import { IStage1Extractor } from '../../types/raw';
import { IStage2Formatter } from '../../types/formatter';
import { IBrokerPlugin } from '../../types/plugin';

export class XxxPlugin implements IBrokerPlugin {
  readonly name = 'xxx';
  readonly displayName = 'Xxx Securities';
  readonly supportedFileTypes = ['pdf'];

  async detect(filePath: string): Promise<number> {
    // Extract first page text, search for broker-specific keywords
    // Return 0-1 confidence score (>= 0.5 to match)
  }

  createExtractor(): IStage1Extractor {
    return new XxxExtractor();
  }

  createFormatter(config?: Record<string, unknown>): IStage2Formatter {
    return new XxxFormatter(config);
  }
}
```

### 3. Implement Stage1 Extractor

```typescript
import { IStage1Extractor, RawTableData } from '../../types/raw';

export class XxxExtractor implements IStage1Extractor {
  async extract(pdfPath: string): Promise<RawTableData> {
    // Extract raw table data from PDF
    // Return: accountInfo, transactions[], holdings[]
  }
}
```

### 4. Implement Stage2 Formatter

```typescript
import { IStage2Formatter } from '../../types/formatter';
import { RawTableData } from '../../types/raw';
import { StatementData } from '../../types/statement';

export class XxxFormatter implements IStage2Formatter {
  async format(rawData: RawTableData): Promise<StatementData> {
    // Convert raw table data to structured StatementData
    // Map transaction types, normalize dates, etc.
  }
}
```

### 5. Register in CLI

In `src/cli/index.ts`:

```typescript
import { XxxPlugin } from '../parsers/xxx';

registry.register(new XxxPlugin());
```

### 6. Export from Public API

In `src/index.ts`:

```typescript
export { XxxPlugin } from './parsers/xxx';
```

### 7. Add Test Fixtures (Must Be Sanitized)

- Add sanitized Stage2 JSON fixtures to `tests/fixtures/<broker>/`
- Add test cases in `tests/stage2.test.ts` referencing new fixtures

## Code Standards

- TypeScript strict mode, zero `any`
- Chinese comments in code (中文注释)
- ESLint + Prettier enforced
- Run before committing: `npm run lint && npm run format:check`

## CI Requirements

Every PR must pass:

- `npm run typecheck` — TypeScript type checking
- `npm run lint` — ESLint
- `npm run format:check` — Prettier formatting
- `npm run test:ci` — Stage2 + CLI tests (parse success rate >= 90%)

## Commit Convention

```bash
# Format: <type>: <description>
# Types: feat | fix | refactor | test | docs | chore

git commit -m "feat: add xxx broker parser"
git commit -m "fix: handle edge case in date parsing"
git commit -m "test: add regression fixtures for xxx"
```
