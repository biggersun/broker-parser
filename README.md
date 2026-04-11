# @tcos/broker-parser

> Parse brokerage PDF statements into structured JSON

[![CI](https://github.com/biggersun/broker-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/biggersun/broker-parser/actions)
[![npm](https://img.shields.io/npm/v/@tcos/broker-parser)](https://www.npmjs.com/package/@tcos/broker-parser)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## Supported Brokers

| Broker | Status |
| --- | --- |
| Phillip Securities (辉立证券) | Supported |

## Quick Start

### Option 1: CLI

```bash
# Install
npm install -g @tcos/broker-parser

# Parse a PDF statement
tcos-parse statement.pdf

# Output to file
tcos-parse statement.pdf -o result.json
```

### Option 2: As an npm Package

```typescript
import { ParsePipeline, PluginRegistry, PhillipPlugin } from '@tcos/broker-parser';

const registry = new PluginRegistry();
registry.register(new PhillipPlugin());
const pipeline = new ParsePipeline(registry);

const result = await pipeline.parse('./statement.pdf');
console.log(result.data);
```

### Option 3: Claude Code Skill (Recommended for Non-Technical Users)

After installing, tell Claude: "Help me parse this PDF statement"

## Prerequisites

- Node.js 18+
- Python 3.8+ with `pdfplumber` (`pip install pdfplumber`)
- poppler
  - macOS: `brew install poppler`
  - Ubuntu: `apt-get install poppler-utils`

## CLI Reference

| Command | Description |
| --- | --- |
| `tcos-parse <pdf>` | Parse PDF, output JSON to stdout |
| `tcos-parse <pdf> -o out.json` | Output to file |
| `tcos-parse <pdf> --raw` | Output Stage1 raw data only |
| `tcos-parse <pdf> --no-clean` | Skip Stage3 cleaning step |
| `tcos-parse <pdf> -b phillip` | Specify broker (skip auto-detect) |
| `tcos-parse --detect <pdf>` | Detect which broker a PDF belongs to |
| `tcos-parse --list-parsers` | List available broker parsers |
| `tcos-parse <pdf> -v` | Show stage timing to stderr |
| `tcos-parse <pdf> -q` | Quiet mode, output JSON only |

## Pipeline Architecture

```
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

## Output Format

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
      "amount": -12340.00,
      "currency": "HKD"
    }
  ],
  "ipo": [],
  "snapshots": [
    {
      "symbol": "HKD",
      "assetCategory": "Cash",
      "quantity": 50000.00,
      "currency": "HKD"
    }
  ]
}
```

Key type definitions:

- **`StatementData`** — Full parsed statement (account info, transactions, IPO records, holdings snapshots)
- **`TradeData`** — Individual trade record (BUY, SELL, DIVIDEND, FEE, etc.)
- **`IPOData`** — IPO subscription/allotment record
- **`SnapshotData`** — Holdings snapshot (cash balances, stock positions)

## Adding a New Broker

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the guide on implementing a new broker plugin.

## Development

```bash
# Install dependencies
npm install

# Run CI tests (Stage2 + CLI, no PDF dependency)
npm test

# Run all tests including Stage1 (requires local PDFs)
npm run test:local

# Lint & format
npm run lint
npm run format:check

# Type check
npm run typecheck

# Build
npm run build
```

## License

MIT
