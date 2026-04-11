/**
 * broker-parser 核心类型定义
 *
 * 定义结单解析输出的结构化数据类型，包括：
 * - TradeData: 交易记录
 * - IPOData: 新股申购记录
 * - SnapshotData: 持仓快照
 * - StatementData: 完整结单数据
 */

export interface TradeData {
  transactionDate: string; // YYYY-MM-DD
  settlementDate?: string; // YYYY-MM-DD
  refNo?: string; // 交易编号/参考号 (用于去重)
  stockCode: string;
  stockName: string;
  transactionType:
    | 'BUY'
    | 'SELL'
    | 'IPO_INTEREST'
    | 'FEE'
    | 'DIVIDEND'
    | 'OTHER'
    | 'DEPOSIT'
    | 'WITHDRAWAL'
    | 'IPO_FEE';
  quantity?: number; // 股数/单位数
  price?: number; // 单价
  amount: number; // 带符号值：负数 = 支出（买入/费用/利息），正数 = 收入（卖出）。
  fee?: number; // 如果绑定到交易，则为显式费用
  currency: string;
  description?: string;
}

export interface IPOData {
  transactionDate: string; // YYYY-MM-DD
  settlementDate?: string; // YYYY-MM-DD
  stockCode: string;
  stockName: string;
  quantity?: number; // 申购/中签股数
  price?: number; // 中签单价
  amount: number; // 涉及金额
  fee?: number; // 手续费
  currency: string;
  description?: string;
  type: 'apply' | 'allot'; // 申购 | 中签
}

export interface SnapshotData {
  symbol: string; // 货币（如 HKD）或股票代码（如 700）
  assetCategory: 'Cash' | 'Stock' | 'Fund' | 'Bond' | 'Other';
  quantity: number; // 现金余额或股份数量
  marketPrice?: number; // 用于股票
  marketValue?: number; // 总价值
  currency: string; // 资产货币
  description?: string;
}

export interface StatementData {
  accountCode: string;
  clientName: string;
  period?: string;
  statementDate?: string; // 显式账单日期（如结束日期）
  transactions: TradeData[]; // 来自第 1 部分
  ipo: IPOData[]; // 来自第 1 部分 (IPO相关)
  snapshots: SnapshotData[]; // 来自第 2 部分（账户）和第 3 部分（投资组合）
}
