# parse-statement 使用示例

## 示例 1：基础解析 — 查看交易记录

**用户说**：帮我解析这份辉立的结单

**操作过程**：
1. 运行 setup 安装环境（首次使用）
2. 执行解析命令

```bash
tcos-parse /path/to/statement_202401.pdf
```

**输出**：

```json
{
  "broker": "phillip",
  "accountCode": "M000001",
  "statementDate": "2024-01-31",
  "transactions": [
    {
      "date": "2024-01-10",
      "ticker": "00700",
      "name": "TENCENT",
      "type": "BUY",
      "quantity": 100,
      "price": 298.40,
      "amount": 29840.00,
      "fee": 50.00,
      "currency": "HKD"
    },
    {
      "date": "2024-01-22",
      "ticker": "09988",
      "name": "BABA-SW",
      "type": "SELL",
      "quantity": 200,
      "price": 72.50,
      "amount": 14500.00,
      "fee": 30.00,
      "currency": "HKD"
    }
  ],
  "holdings": [
    {
      "ticker": "00700",
      "name": "TENCENT",
      "quantity": 100,
      "avgCost": 298.40,
      "marketValue": 30000.00,
      "currency": "HKD"
    }
  ],
  "assets": {
    "totalAssets": 150000.00,
    "cashBalance": 120000.00,
    "marketValue": 30000.00,
    "currency": "HKD"
  }
}
```

---

## 示例 2：输出到文件

**用户说**：解析后保存到文件，方便我后续导入系统

```bash
tcos-parse /path/to/statement_202401.pdf -o result.json
```

**输出（stderr）**：

```
Written to result.json
```

解析结果已写入 `result.json`，不会输出到终端。

---

## 示例 3：调试 — 查看原始提取数据

**用户说**：解析结果不对，我想看看 PDF 里原始提取出了什么

使用 `--raw` 选项只执行 Stage1（pdfplumber 提取），跳过格式化和清理：

```bash
tcos-parse /path/to/statement_202401.pdf --raw
```

**输出**：

```json
{
  "pages": [
    {
      "pageNumber": 1,
      "tables": [
        [["Date", "Stock Code", "Description", "Buy/Sell", "Qty", "Price", "Amount"],
         ["10/01/2024", "00700", "TENCENT", "B", "100", "298.40", "29,840.00"]]
      ]
    }
  ]
}
```

---

## 示例 4：调试 — 查看各阶段耗时

**用户说**：解析好慢，想看看慢在哪一步

使用 `-v` 查看各阶段耗时（耗时输出到 stderr，不污染 JSON）：

```bash
tcos-parse /path/to/statement_202401.pdf -v
```

**stderr 输出**：

```
[timing] detect=120ms stage1=850ms stage2=30ms clean=15ms total=1015ms
```

**stdout 输出**：正常的 JSON 解析结果。

可以配合重定向只看耗时：

```bash
tcos-parse /path/to/statement_202401.pdf -v > /dev/null
```

---

## 示例 5：检测 PDF 所属券商

**用户说**：这个 PDF 是哪家券商的结单？

```bash
tcos-parse --detect /path/to/unknown_statement.pdf
```

**输出**：

```
Detected broker: phillip (confidence: 0.95)
```

静默模式只输出券商名称：

```bash
tcos-parse --detect /path/to/unknown_statement.pdf -q
```

**输出**：

```
phillip
```

---

## 示例 6：列出支持的券商

**用户说**：目前支持解析哪些券商的结单？

```bash
tcos-parse --list-parsers
```

**输出**：

```
Available parsers:
  phillip — Phillip Securities (辉立证券)
```

---

## 示例 7：指定券商跳过自动检测

**用户说**：我知道这是辉立的结单，不需要自动检测

使用 `-b` 直接指定券商，省去检测步骤：

```bash
tcos-parse -b phillip /path/to/statement_202401.pdf
```

---

## 示例 8：管道处理 — 用 jq 过滤特定交易

**用户说**：我只想看买入交易

```bash
tcos-parse /path/to/statement_202401.pdf -q | jq '.transactions[] | select(.type == "BUY")'
```

**输出**：

```json
{
  "date": "2024-01-10",
  "ticker": "00700",
  "name": "TENCENT",
  "type": "BUY",
  "quantity": 100,
  "price": 298.40,
  "amount": 29840.00,
  "fee": 50.00,
  "currency": "HKD"
}
```

统计交易笔数：

```bash
tcos-parse /path/to/statement_202401.pdf -q | jq '.transactions | length'
```

---

## 示例 9：批量解析多份结单

**用户说**：我有几个月的结单，想一起解析

用 shell 循环批量处理，每份结单输出到独立文件：

```bash
for pdf in /path/to/statements/*.pdf; do
  name=$(basename "$pdf" .pdf)
  tcos-parse "$pdf" -q -o "${name}.json"
  echo "Done: $pdf -> ${name}.json"
done
```

---

## 示例 10：跳过清理步骤

**用户说**：Stage3 清理把我的某些数据删了，我想跳过清理

使用 `--no-clean` 跳过 Stage3 数据清理：

```bash
tcos-parse /path/to/statement_202401.pdf --no-clean
```

解析管道只执行 Stage1（提取）和 Stage2（格式化），不做去重和清洗。
