# parse-statement 使用示例

## 示例 1：解析辉立证券月结单

用户：帮我解析这个 PDF 结单 `/path/to/statement.pdf`

```bash
tcos-parse /path/to/statement.pdf
```

输出：

```json
{
  "broker": "phillip",
  "accountCode": "M000001",
  "statementDate": "2024-01-31",
  "transactions": [...],
  "holdings": [...],
  "assets": { "totalAssets": 100000.00 }
}
```

## 示例 2：只提取原始数据

用户：我只想看 PDF 提取的原始表格数据

```bash
tcos-parse /path/to/statement.pdf --raw
```

## 示例 3：检测 PDF 所属券商

用户：这个 PDF 是哪家券商的？

```bash
tcos-parse --detect /path/to/statement.pdf
```

输出：

```
Detected broker: phillip (Phillip Securities, confidence: 0.95)
```

## 示例 4：输出到文件

用户：解析后保存到文件

```bash
tcos-parse /path/to/statement.pdf -o result.json
```
