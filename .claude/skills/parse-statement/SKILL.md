---
name: parse-statement
description: 解析券商 PDF 结单文件，提取交易记录、持仓和资产汇总为结构化 JSON
---

## 触发条件

以下情况触发此 Skill：

- 用户提供 PDF 文件，要求解析/读取/提取数据
- 用户提到「结单」、「月结单」、「交易结单」、「对账单」、「持仓报告」、「brokerage statement」
- 用户要求将 PDF 转为 JSON、提取交易记录、查看持仓
- 关键词：辉立证券、Phillip Securities、结单解析、parse statement

## Setup

先运行以下命令确保环境就绪：

```bash
npx @tcos/broker-parser setup
npx @tcos/broker-parser install-skill
```

如果已经全局安装过 `@tcos/broker-parser`，也可以使用：

```bash
tcos-parse setup
tcos-parse install-skill
```

## 使用方式

```bash
# 基础解析
tcos-parse <pdf>                    # 解析并输出 JSON 到 stdout
tcos-parse <pdf> -o out.json        # 输出到文件

# 指定券商（跳过自动检测）
tcos-parse -b phillip <pdf>         # 指定券商为 phillip

# 阶段控制
tcos-parse <pdf> --raw              # 只输出 Stage1 原始提取数据
tcos-parse <pdf> --no-clean         # 跳过 Stage3 清理步骤

# 检测与查询
tcos-parse --detect <pdf>           # 检测 PDF 所属券商
tcos-parse --list-parsers           # 列出支持的券商解析器

# 输出控制
tcos-parse <pdf> -v                 # 显示各阶段耗时（输出到 stderr）
tcos-parse <pdf> -q                 # 静默模式，只输出 JSON（无额外提示信息）
```

### 选项说明

| 选项             | 说明                                   |
| ---------------- | -------------------------------------- |
| `-o, --output`   | 输出到文件而非 stdout                  |
| `-b, --broker`   | 指定券商名称，跳过自动检测             |
| `--raw`          | 只输出 Stage1 原始表格数据，不做格式化 |
| `--no-clean`     | 跳过 Stage3 数据清理步骤               |
| `--detect`       | 检测 PDF 所属券商及置信度              |
| `--list-parsers` | 列出所有可用的券商解析器               |
| `-v, --verbose`  | 显示各阶段耗时详情（输出到 stderr）    |
| `-q, --quiet`    | 静默模式，仅输出纯 JSON                |

## 输出格式

完整解析结果（StatementData）：

```json
{
  "broker": "phillip",
  "accountCode": "M000001",
  "statementDate": "2024-01-31",
  "transactions": [
    {
      "date": "2024-01-15",
      "ticker": "00700",
      "name": "TENCENT",
      "type": "BUY",
      "quantity": 100,
      "price": 298.4,
      "amount": 29840.0,
      "fee": 50.0,
      "currency": "HKD"
    }
  ],
  "holdings": [
    {
      "ticker": "00700",
      "name": "TENCENT",
      "quantity": 100,
      "avgCost": 298.4,
      "marketValue": 30000.0,
      "currency": "HKD"
    }
  ],
  "assets": {
    "totalAssets": 150000.0,
    "cashBalance": 120000.0,
    "marketValue": 30000.0,
    "currency": "HKD"
  }
}
```
