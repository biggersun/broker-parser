# 输出格式

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
