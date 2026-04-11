/**
 * 数据清理工具模块
 *
 * 提取自 StatementValidator 的公共清理逻辑，不依赖数据库。
 * 用于 Parser Tuning 的 Stage 3 验证测试。
 *
 * 与 StatementValidator 的区别：
 * - 本模块只做基于规则的清理，不查询数据库去重
 * - StatementValidator 会查询数据库判断 refNo 是否存在
 */

import { TradeData, SnapshotData, IPOData, StatementData } from '../types/statement';

/**
 * IPO 识别关键词（与 Stage2 保持一致）
 */
const IPO_KEYWORDS = ['IPO', '新股', '认购', '認購', '公开发售', '公開發售', 'PUBLIC OFFER'];

/**
 * 清理规则配置接口
 */
export interface CleaningConfig {
  skipZeroAmount: boolean; // 过滤金额为 0 或空的记录
  requireRefNo: boolean; // 过滤没有参考编号的记录
  excludeHKDBase: boolean; // 从快照中排除 HKD(Base) 记录
  dedupeByRefNo: boolean; // 根据参考编号去重交易记录
  filterInvalidIPO: boolean; // 过滤缺少必要字段的 IPO 记录
}

/**
 * 默认清理配置
 */
export const DEFAULT_CLEANING_CONFIG: CleaningConfig = {
  skipZeroAmount: true,
  requireRefNo: true,
  excludeHKDBase: true,
  dedupeByRefNo: true,
  filterInvalidIPO: true,
};

/**
 * 清理结果接口
 */
export interface CleaningResult<T> {
  cleaned: T[];
  filtered: T[];
  filterReasons: string[];
}

/**
 * 清理交易记录
 *
 * @param transactions - 原始交易记录数组
 * @param config - 清理规则配置
 * @returns 清理结果，包含清理后的记录和被过滤的记录
 */
export function cleanTransactions(
  transactions: TradeData[],
  config: CleaningConfig
): CleaningResult<TradeData> {
  if (!transactions || transactions.length === 0) {
    return { cleaned: [], filtered: [], filterReasons: [] };
  }

  const filtered: TradeData[] = [];
  const filterReasons: string[] = [];
  const uniqueMap = new Map<string, TradeData>();

  for (const tx of transactions) {
    // 规则 1: 过滤零金额
    if (config.skipZeroAmount) {
      if (tx.amount === null || tx.amount === undefined || tx.amount === 0) {
        filtered.push(tx);
        filterReasons.push(`交易 ${tx.refNo || 'unknown'}: 金额为空或零`);
        continue;
      }
    }

    // 规则 2: 要求 RefNo
    if (config.requireRefNo) {
      if (!tx.refNo) {
        filtered.push(tx);
        filterReasons.push(`交易: 缺少参考编号`);
        continue;
      }
    }

    // 规则 3: RefNo 去重
    if (config.dedupeByRefNo && tx.refNo) {
      if (uniqueMap.has(tx.refNo)) {
        const existing = uniqueMap.get(tx.refNo)!;
        // 保留字段更完整的记录
        if (Object.keys(tx).length > Object.keys(existing).length) {
          filtered.push(existing);
          filterReasons.push(`交易 ${existing.refNo}: 被更完整的记录替代`);
          uniqueMap.set(tx.refNo, tx);
        } else {
          filtered.push(tx);
          filterReasons.push(`交易 ${tx.refNo}: 重复记录`);
        }
        continue;
      }
      uniqueMap.set(tx.refNo, tx);
    } else if (!config.dedupeByRefNo) {
      // 不去重时直接添加到 map（使用索引作为 key）
      uniqueMap.set(`idx_${uniqueMap.size}`, tx);
    }
  }

  // 标准化交易类型
  let cleaned = Array.from(uniqueMap.values()).map((tx) => normalizeTransaction(tx));

  // 过滤 IPO 相关的无效记录
  cleaned = cleaned.filter((tx) => {
    const upDesc = (tx.description || '').toUpperCase();
    const isIPO = IPO_KEYWORDS.some((kw) => upDesc.includes(kw.toUpperCase()));
    if (isIPO) {
      // 允许通过的 IPO 交易类型
      const allowedIPOTypes = ['IPO_FEE', 'IPO_INTEREST', 'BUY'];
      if (allowedIPOTypes.includes(tx.transactionType)) {
        return true;
      }
      filtered.push(tx);
      filterReasons.push(`交易 ${tx.refNo}: IPO 相关但类型为 ${tx.transactionType}`);
      return false;
    }
    return true;
  });

  return { cleaned, filtered, filterReasons };
}

/**
 * 标准化交易类型
 * 根据描述自动判断 WITHDRAWAL/DEPOSIT 类型
 */
export function normalizeTransaction(tx: TradeData): TradeData {
  const desc = (tx.description || '').toUpperCase();

  if (desc.includes('EPAYMENT') || desc.includes('電子轉帳')) {
    tx.transactionType = 'WITHDRAWAL';
  } else if (
    desc.includes('EDDA') ||
    desc.includes('DIRECT DEBIT') ||
    desc.includes('DEP REFE') ||
    desc.includes('直接轉帳')
  ) {
    tx.transactionType = 'DEPOSIT';
  }

  return tx;
}

/**
 * 清理 IPO 记录
 *
 * @param ipoList - 原始 IPO 记录数组
 * @param config - 清理规则配置
 * @returns 清理结果
 */
export function cleanIPO(ipoList: IPOData[], config: CleaningConfig): CleaningResult<IPOData> {
  if (!ipoList || ipoList.length === 0) {
    return { cleaned: [], filtered: [], filterReasons: [] };
  }

  const cleaned: IPOData[] = [];
  const filtered: IPOData[] = [];
  const filterReasons: string[] = [];

  for (const item of ipoList) {
    // 规则: 过滤无效 IPO 记录
    if (config.filterInvalidIPO) {
      if (!item.stockCode) {
        filtered.push(item);
        filterReasons.push(`IPO: 缺少股票代码`);
        continue;
      }
      if (item.amount === undefined || item.amount === null) {
        filtered.push(item);
        filterReasons.push(`IPO ${item.stockCode}: 金额为空`);
        continue;
      }
    }

    cleaned.push(item);
  }

  return { cleaned, filtered, filterReasons };
}

/**
 * 清理持仓快照记录
 *
 * @param snapshots - 原始快照记录数组
 * @param config - 清理规则配置
 * @returns 清理结果
 */
export function cleanSnapshots(
  snapshots: SnapshotData[],
  config: CleaningConfig
): CleaningResult<SnapshotData> {
  if (!snapshots || snapshots.length === 0) {
    return { cleaned: [], filtered: [], filterReasons: [] };
  }

  const cleaned: SnapshotData[] = [];
  const filtered: SnapshotData[] = [];
  const filterReasons: string[] = [];

  for (const item of snapshots) {
    // 规则 1: 排除 HKD(Base)
    if (config.excludeHKDBase && item.symbol === 'HKD(Base)') {
      filtered.push(item);
      filterReasons.push(`快照 ${item.symbol}: HKD(Base) 被排除`);
      continue;
    }

    // 规则 2: 现金类别只保留 HKD/USD
    if (item.assetCategory === 'Cash') {
      if (!['HKD', 'USD'].includes(item.symbol.toUpperCase())) {
        filtered.push(item);
        filterReasons.push(`快照 ${item.symbol}: 非 HKD/USD 现金被排除`);
        continue;
      }
    }

    cleaned.push(item);
  }

  return { cleaned, filtered, filterReasons };
}

/**
 * 清理整个 StatementData
 *
 * @param data - 原始结单数据
 * @param config - 清理规则配置
 * @returns 清理后的结单数据和清理详情
 */
export function cleanStatementData(
  data: StatementData,
  config: Partial<CleaningConfig> = {}
): {
  result: StatementData;
  details: {
    transactions: CleaningResult<TradeData>;
    ipo: CleaningResult<IPOData>;
    snapshots: CleaningResult<SnapshotData>;
  };
} {
  // 合并配置
  const mergedConfig: CleaningConfig = { ...DEFAULT_CLEANING_CONFIG, ...config };

  // 清理各部分
  const transactionsResult = cleanTransactions(data.transactions || [], mergedConfig);
  const ipoResult = cleanIPO(data.ipo || [], mergedConfig);
  const snapshotsResult = cleanSnapshots(data.snapshots || [], mergedConfig);

  return {
    result: {
      ...data,
      transactions: transactionsResult.cleaned,
      ipo: ipoResult.cleaned,
      snapshots: snapshotsResult.cleaned,
    },
    details: {
      transactions: transactionsResult,
      ipo: ipoResult,
      snapshots: snapshotsResult,
    },
  };
}
