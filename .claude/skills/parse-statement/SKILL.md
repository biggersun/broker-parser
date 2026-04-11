---
name: parse-statement
description: 解析券商 PDF 结单文件，提取交易记录、持仓和资产汇总为结构化 JSON
---

## 触发条件

以下情况触发此 Skill：

- 用户提供 PDF 文件，要求解析/读取/提取数据
- 用户提到「结单」、「月结单」、「对账单」、「brokerage statement」
- 用户要求将 PDF 转为 JSON、提取交易记录、查看持仓
- 关键词：辉立证券、Phillip Securities、结单解析、parse statement

## Setup

运行以下 setup 脚本确保环境就绪：

```bash
#!/usr/bin/env bash
set -e

# 1. 检查并安装 CLI
if ! command -v tcos-parse &>/dev/null; then
  echo "Installing tcos-parse..."
  npm install -g @tcos/broker-parser
fi

# 2. 检查 Python 3
if ! command -v python3 &>/dev/null; then
  if command -v brew &>/dev/null; then
    brew install python3
  elif command -v apt-get &>/dev/null; then
    sudo apt-get install -y python3 python3-pip
  else
    echo "ERROR: Cannot install Python automatically. Please install Python 3 manually."
    exit 1
  fi
fi

# 3. 检查并安装 pdfplumber
if ! python3 -c "import pdfplumber" 2>/dev/null; then
  pip3 install pdfplumber
fi

# 4. 检查 poppler（pdfplumber 底层依赖）
if ! command -v pdftotext &>/dev/null; then
  if command -v brew &>/dev/null; then
    brew install poppler
  elif command -v apt-get &>/dev/null; then
    sudo apt-get install -y poppler-utils
  fi
fi

echo "tcos-parse setup complete"
tcos-parse --version
```

## 使用方式

```bash
tcos-parse <pdf>                    # 解析并输出 JSON 到 stdout
tcos-parse <pdf> -o out.json        # 输出到文件
tcos-parse <pdf> --raw              # 只输出 Stage1 原始数据
tcos-parse --detect <pdf>           # 检测 PDF 所属券商
tcos-parse --list-parsers           # 列出支持的券商
```

## 输出格式

```json
{
  "broker": "phillip",
  "accountCode": "M000001",
  "statementDate": "2024-01-31",
  "transactions": [],
  "holdings": [],
  "assets": {}
}
```
