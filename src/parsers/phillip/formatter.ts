/**
 * Phillip 规则格式化器 (Stage 2)
 *
 * 将 Stage 1 输出的 RawTableData 转换为 StatementData。
 * 使用规则引擎进行分类、字段提取、合并等操作。
 *
 * 规则对齐 LLM Prompt (DEEPSEEK_SYS_PROMPT)：
 * 1. 日期格式转换 (DD/MM/YY → YYYY-MM-DD)
 * 2. 交易分类 (IPO, REDEEM, DIVIDEND 等)
 * 3. 股票代码/名称提取
 * 4. 数量/价格解析
 * 5. 交易类型映射
 * 6. IPO 中间记录过滤 (Apply/Loan/Refund 从 transactions 中丢弃)
 * 7. 空金额记录过滤
 * 8. 内部转账记录过滤 (金额为 0 的 Withdraw/Deposit)
 */

import { StatementData, TradeData, IPOData, SnapshotData } from '../../types/statement';
import { RawTableData, RawTransactionRow } from '../../types/raw';
import { IStage2Formatter, RuleFormatterConfig } from '../../types/formatter';

// ============================================================================
// 分类规则定义
// ============================================================================

/** 分类规则 */
const CATEGORY_RULES: Array<{
  pattern: RegExp | string[];
  category: string;
  subTypeRules?: Array<{ pattern: RegExp | string[]; subType: string }>;
}> = [
  {
    pattern: ['IPO', '新股認購', '新股认购', '公开发售', '公開發售', 'PUBLIC OFFER'],
    category: 'IPO',
    subTypeRules: [
      { pattern: ['ALLOT', '配發', '配发', '中籤', '中签'], subType: 'IPO_ALLOT' },
      { pattern: ['HANDLING FEE', '手續費', '手续费', 'IPO FEE'], subType: 'IPO_FEE' },
      { pattern: ['INTEREST', '利息'], subType: 'IPO_INTEREST' },
      { pattern: ['Apply Deposit', '10%', '申請按金', '申请按金'], subType: 'IPO_APPLY_CASH' },
      { pattern: ['Refund', '退款'], subType: 'IPO_REFUND' },
      { pattern: ['REPAY', '還款', '还款'], subType: 'IPO_REPAY' },
      { pattern: ['APPLY', '申請孖展', '申请孖展', '孖展', 'LOAN'], subType: 'IPO_APPLY_MARGIN' },
    ],
  },
  {
    // 注意: Reverse 贖回 必须先于 REDEEM 规则匹配，优先级更高
    // "Reverse 贖回" = 撤销赎回，钱重新投入基金 = BUY，不是 SELL
    // 错误识别会导致 FIFO 产生虚假盈亏（参见 bug: fjl_260109_reverse_redeem_stage2）
    pattern: ['Reverse 贖回', 'Reverse 赎回', 'Reverse REDEEM'],
    category: 'REVERSE_REDEEM',
  },
  {
    pattern: ['贖回', '赎回', 'REDEEM'],
    category: 'REDEEM',
  },
  {
    // 注意: 不能使用 'DIV' 作为模式，因为会误匹配 'DIVERSIFIED' 等股票名
    pattern: ['股息', 'DIVIDEND'],
    category: 'DIVIDEND',
  },
  {
    // 注意: 不能使用 'INT' 作为模式，因为会误匹配 'INTL' (如 ZIJIN GOLD INTL)
    // 但 'INT ADJ' 是安全的完整匹配（利息调整）
    pattern: ['利息', 'INTEREST', 'INT ADJ'],
    category: 'INTEREST',
  },
  {
    pattern: ['提貨', '提货', 'W/D'],
    category: 'WITHDRAW',
  },
  {
    // 注意: 不能使用 'DEP' 作为模式，因为会误匹配 'DEPT', 'DEEP' 等
    pattern: ['存入', 'Deposit', '存貨', '存货'],
    category: 'DEPOSIT',
  },
  {
    // 注意: 不能使用 'SUB' 作为模式，因为会误匹配 'SUBWAY', 'SUBSIDIARY' 等
    pattern: ['購買', '购买', 'Subscribe'],
    category: 'FUND_SUBSCRIBE',
  },
  {
    pattern: ['賣出', '卖出', 'Sell', 'Sold'],
    category: 'STOCK_SELL',
  },
  {
    pattern: ['買入', '买入', 'Buy', 'Bought'],
    category: 'STOCK_BUY',
  },
  {
    pattern: ['Epayment', '電子轉帳', '电子转账'],
    category: 'EPAYMENT',
  },
  {
    pattern: ['eDDA', 'Direct Debit', '直接轉帳', '直接转账'],
    category: 'EDDA',
  },
  {
    // 货币转换：过滤掉，不保存为交易记录
    pattern: ['兌換', 'CONVERT', '货币转换', 'Currency Exchange'],
    category: 'CURRENCY_EXCHANGE',
  },
];

/** 交易类型映射 */
const TRANSACTION_TYPE_MAP: Record<string, TradeData['transactionType']> = {
  Payment: 'BUY',
  Receipt: 'SELL',
  Withdraw: 'WITHDRAWAL',
  Deposit: 'DEPOSIT',
  Buy: 'BUY',
  Sell: 'SELL',
};

// ============================================================================
// 规则格式化器实现
// ============================================================================

/**
 * Phillip 规则格式化器
 */
export class PhillipRuleFormatter implements IStage2Formatter {
  // 配置预留，enableMerge 等选项供后续扩展使用
  private readonly _config: RuleFormatterConfig;

  constructor(config?: Partial<Omit<RuleFormatterConfig, 'type'>>) {
    this._config = {
      type: 'rule',
      enableMerge: true,
      ...config,
    };
  }

  /** 获取格式化器配置（供外部读取） */
  get config(): RuleFormatterConfig {
    return this._config;
  }

  /**
   * 将原始表格数据格式化为结构化数据
   * 实现为同步逻辑，但接口要求返回 Promise 以兼容异步实现（如 LLM 方案）
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async format(rawData: RawTableData): Promise<StatementData> {
    // 1. 转换交易记录
    const { transactions, ipoRecords } = this.formatTransactions(rawData.transactions);

    // 2. 转换持仓数据
    const snapshots = this.formatHoldings(rawData.holdings);

    // 3. 转换日期格式
    const statementDate = this.convertDateFormat(rawData.accountInfo.statementDate);

    return {
      accountCode: rawData.accountInfo.accountCode || '',
      clientName: rawData.accountInfo.clientName || '',
      period: statementDate,
      statementDate,
      transactions,
      ipo: ipoRecords,
      snapshots,
    };
  }

  /**
   * 格式化交易记录
   * 遵循 LLM Prompt 规则：
   * - 丢弃空金额记录
   * - IPO 中间记录 (Apply/Loan/Refund) 不放入 transactions，只放入 ipo
   * - 只有 IPO_FEE 和 IPO_ALLOT(BUY) 放入 transactions
   * - 丢弃金额为 0 的内部转账
   * - IPO 同一公司的申购记录合并为一条，保留申购数量
   * - 配发(allot)记录单独保留
   */
  private formatTransactions(rawTransactions: RawTransactionRow[]): {
    transactions: TradeData[];
    ipoRecords: IPOData[];
  } {
    const transactions: TradeData[] = [];
    // 用于收集 IPO 记录，按股票代码分组
    const ipoApplyMap = new Map<
      string,
      {
        stockCode: string;
        stockName: string;
        quantity?: number;
        price?: number;
        totalAmount: number;
        transactionDate: string;
        settlementDate?: string;
        descriptions: string[];
      }
    >();
    const ipoAllotRecords: IPOData[] = [];

    for (const raw of rawTransactions) {
      // 跳过空金额记录 (LLM规则: Skip Empty)
      if (this.isEmpty(raw.debit) && this.isEmpty(raw.credit)) {
        continue;
      }

      // 解析分类
      const { category, subType } = this.parseCategory(raw.particulars);

      // 过滤货币转换记录：不保存为交易记录
      if (category === 'CURRENCY_EXCHANGE') {
        continue;
      }

      // 解析股票信息
      const stockInfo = this.parseStockInfo(raw.particulars);

      // 解析数量和价格 - 从 description 结尾提取 数量@价格
      const qtyPrice = this.parseQuantityPriceFromEnd(raw.particulars);

      // 转换日期格式
      const transactionDate = this.convertDateFormat(raw.tradeDate);
      const settlementDate = raw.settleDate ? this.convertDateFormat(raw.settleDate) : undefined;

      // 计算金额 (负数 = 支出，正数 = 收入)
      const amount = raw.credit ? raw.credit : raw.debit ? -raw.debit : 0;

      // 处理 IPO 记录
      if (category === 'IPO') {
        const ipoType = this.getIPOType(subType);
        const stockCode = stockInfo?.code || 'N/A';

        if (ipoType === 'allot') {
          // IPO ALLOT 使用专门的数量解析方法
          const allotQtyPrice = this.parseIpoAllotQuantityPrice(raw.particulars);
          const allotQuantity = allotQtyPrice?.quantity ?? qtyPrice?.quantity;
          const allotPrice = allotQtyPrice?.price ?? qtyPrice?.price;

          // 配发记录单独保留
          const ipoRecord: IPOData = {
            transactionDate,
            settlementDate,
            stockCode,
            stockName: stockInfo?.name || '',
            quantity: allotQuantity,
            price: allotPrice,
            amount: Math.abs(amount),
            fee: undefined,
            currency: 'HKD',
            description: raw.particulars,
            type: 'allot',
          };
          ipoAllotRecords.push(ipoRecord);

          // IPO 配发 → BUY 放入 transactions
          const trade: TradeData = {
            transactionDate,
            settlementDate,
            refNo: raw.refNo,
            stockCode,
            stockName: stockInfo?.name || '',
            transactionType: 'BUY',
            quantity: allotQuantity,
            price: allotPrice,
            amount,
            fee: undefined,
            currency: 'HKD',
            description: raw.particulars,
          };
          transactions.push(trade);
        } else if (subType === 'IPO_APPLY_CASH' || subType === 'IPO_APPLY_MARGIN') {
          // 只有真正的申购记录才生成 apply 记录
          // Refund（退款）、REPAY（还款）等中间记录不生成 IPO 记录
          const existing = ipoApplyMap.get(stockCode);
          if (existing) {
            // 累加金额
            existing.totalAmount += Math.abs(amount);
            existing.descriptions.push(raw.particulars);
            // 如果当前记录有数量和价格，更新（优先取有值的）
            if (qtyPrice?.quantity && !existing.quantity) {
              existing.quantity = qtyPrice.quantity;
            }
            if (qtyPrice?.price && !existing.price) {
              existing.price = qtyPrice.price;
            }
          } else {
            ipoApplyMap.set(stockCode, {
              stockCode,
              stockName: stockInfo?.name || '',
              quantity: qtyPrice?.quantity,
              price: qtyPrice?.price,
              totalAmount: Math.abs(amount),
              transactionDate,
              settlementDate,
              descriptions: [raw.particulars],
            });
          }
        }
        // 其他 IPO 子类型（Refund、REPAY 等）不生成 IPO 记录

        // IPO_FEE 放入 transactions
        if (subType === 'IPO_FEE') {
          const trade: TradeData = {
            transactionDate,
            settlementDate,
            refNo: raw.refNo,
            stockCode,
            stockName: stockInfo?.name || '',
            transactionType: 'IPO_FEE',
            quantity: undefined,
            price: undefined,
            amount,
            fee: Math.abs(amount),
            currency: 'HKD',
            description: raw.particulars,
          };
          transactions.push(trade);
        }

        // IPO_INTEREST 放入 transactions
        if (subType === 'IPO_INTEREST') {
          const trade: TradeData = {
            transactionDate,
            settlementDate,
            refNo: raw.refNo,
            stockCode,
            stockName: stockInfo?.name || '',
            transactionType: 'IPO_INTEREST',
            quantity: undefined,
            price: undefined,
            amount,
            fee: undefined,
            currency: 'HKD',
            description: raw.particulars,
          };
          transactions.push(trade);
        }
        continue;
      }

      // 处理内部转账：丢弃金额为 0 的 Withdraw/Deposit
      if ((category === 'WITHDRAW' || category === 'DEPOSIT') && Math.abs(amount) < 0.01) {
        continue;
      }

      // 处理 EPAYMENT → WITHDRAWAL
      if (category === 'EPAYMENT') {
        const trade: TradeData = {
          transactionDate,
          settlementDate,
          refNo: raw.refNo,
          stockCode: 'N/A',
          stockName: '',
          transactionType: 'WITHDRAWAL',
          quantity: undefined,
          price: undefined,
          amount,
          fee: undefined,
          currency: 'HKD',
          description: raw.particulars,
        };
        transactions.push(trade);
        continue;
      }

      // 处理 EDDA → DEPOSIT
      if (category === 'EDDA') {
        const trade: TradeData = {
          transactionDate,
          settlementDate,
          refNo: raw.refNo,
          stockCode: 'N/A',
          stockName: '',
          transactionType: 'DEPOSIT',
          quantity: undefined,
          price: undefined,
          amount,
          fee: undefined,
          currency: 'HKD',
          description: raw.particulars,
        };
        transactions.push(trade);
        continue;
      }

      // 非 IPO 记录放入 transactions
      const transactionType = this.mapTransactionType(raw.transType, category);
      const trade: TradeData = {
        transactionDate,
        settlementDate,
        refNo: raw.refNo,
        stockCode: stockInfo?.code || 'N/A',
        stockName: stockInfo?.name || '',
        transactionType,
        quantity: qtyPrice?.quantity,
        price: qtyPrice?.price,
        amount,
        fee: undefined,
        currency: 'HKD',
        description: raw.particulars,
      };
      transactions.push(trade);
    }

    // 将合并后的 IPO 申购记录转换为 IPOData
    const ipoRecords: IPOData[] = [];
    for (const [, apply] of ipoApplyMap) {
      // amount = quantity × price，不累加
      const calculatedAmount =
        apply.quantity && apply.price ? apply.quantity * apply.price : apply.totalAmount;
      const ipoRecord: IPOData = {
        transactionDate: apply.transactionDate,
        settlementDate: apply.settlementDate,
        stockCode: apply.stockCode,
        stockName: apply.stockName,
        quantity: apply.quantity,
        price: apply.price,
        amount: calculatedAmount,
        fee: undefined,
        currency: 'HKD',
        description: apply.descriptions[0], // 使用第一条描述
        type: 'apply',
      };
      ipoRecords.push(ipoRecord);
    }

    // 添加配发记录
    ipoRecords.push(...ipoAllotRecords);

    return { transactions, ipoRecords };
  }

  /**
   * 格式化持仓数据
   * LLM规则: Cash 只提取 HKD 和 USD，排除 HKD(Base)
   */
  private formatHoldings(rawHoldings: RawTableData['holdings']): SnapshotData[] {
    return rawHoldings
      .filter((raw) => {
        // 排除 HKD(Base)
        if (raw.symbol?.includes('(Base)') || raw.name?.includes('(Base)')) {
          return false;
        }
        return true;
      })
      .map((raw) => {
        // 智能处理名称
        let description = raw.name || '';

        // 处理基金名称 - 参考 parseStockInfo 的逻辑
        if (raw.symbol?.includes('UT.') || raw.assetType === 'Fund') {
          // 辉立港元货币市场基金
          if (
            (raw.name?.includes('Phillip') && raw.name?.includes('Money')) ||
            raw.name?.includes('輝立港元貨幣市場基金') ||
            raw.name?.includes('辉立港元货币市场基金') ||
            raw.symbol?.includes('PHILLIP')
          ) {
            description = 'Phillip HKD Money Market Fund 輝立港元貨幣市場基金';
          }
        }

        return {
          symbol: raw.symbol,
          assetCategory: this.mapAssetCategory(raw.assetType),
          quantity: raw.quantity || 0,
          marketPrice: raw.marketPrice,
          marketValue: raw.marketValue,
          currency: raw.currency || 'HKD',
          description,
        };
      });
  }

  // ============================================================================
  // 解析方法
  // ============================================================================

  /**
   * 检查值是否为空
   */
  private isEmpty(value: number | undefined | null): boolean {
    return value === undefined || value === null || value === 0;
  }

  /**
   * 解析分类
   */
  private parseCategory(particulars: string): { category?: string; subType?: string } {
    for (const rule of CATEGORY_RULES) {
      const patterns = Array.isArray(rule.pattern) ? rule.pattern : [rule.pattern];
      const matches = patterns.some((p) =>
        p instanceof RegExp ? p.test(particulars) : particulars.includes(p)
      );

      if (matches) {
        let subType: string | undefined;

        if (rule.subTypeRules) {
          for (const subRule of rule.subTypeRules) {
            const subPatterns = Array.isArray(subRule.pattern)
              ? subRule.pattern
              : [subRule.pattern];
            const subMatches = subPatterns.some((p) =>
              p instanceof RegExp ? p.test(particulars) : particulars.includes(p)
            );
            if (subMatches) {
              subType = subRule.subType;
              break;
            }
          }
        }

        return { category: rule.category, subType };
      }
    }

    return {};
  }

  /**
   * 解析股票信息
   */
  private parseStockInfo(particulars: string): { code?: string; name?: string } | null {
    // 模式A: 股票交易格式 - 中文名/XHKG/代码 (如 "龍旗科技/XHKG/009611" 或 "寶濟藥業－Ｂ/XHKG/002659")
    // 注意: 中文名可能包含全角字符如 "－Ｂ"
    const stockTradeMatch = particulars.match(
      /([\u4e00-\u9fff\uff00-\uffef\u3000-\u303f]+)\/X[A-Z]{2,4}\/(\d{5,6})/
    );
    if (stockTradeMatch) {
      const chineseName = stockTradeMatch[1].trim();
      const code = stockTradeMatch[2];
      // 尝试从开头提取英文名 (如 "LONGCHEER 100 32.2000" 中的 LONGCHEER)
      // 支持带连字符的名称如 "BAO PHARMA-B"
      const englishNameMatch = particulars.match(/^([A-Z][A-Z\s-]+?)(?:\s+\d)/);
      if (englishNameMatch) {
        return { code, name: `${englishNameMatch[1].trim()} ${chineseName}` };
      }
      return { code, name: chineseName };
    }

    // 模式A2: 股票卖出格式 - 英文名 数量 价格 金额 ... /XHKG/代码
    // 如 "MINIMAX-WP 20 288.0000 5,760.00 股票 賣出 /XHKG/000100"
    // 注意：只在非 IPO 场景下使用，因为 IPO 记录可能包含 "/XHKG/" 但格式不同
    const stockSellMatch = particulars.match(/\/X[A-Z]{2,4}\/(\d{5,6})/);
    if (stockSellMatch && !particulars.includes('IPO') && !particulars.includes('新股認購')) {
      const code = stockSellMatch[1];
      // 尝试从开头提取英文名
      const englishNameMatch = particulars.match(/^([A-Z][A-Z\s-]+?)(?:\s+\d)/);
      // 尝试提取中文名（如 "股票 賣出" 前的部分不算）
      const chineseMatch = particulars.match(/([\u4e00-\u9fff]{2,})(?=\/X)/);
      if (englishNameMatch && chineseMatch) {
        return { code, name: `${englishNameMatch[1].trim()} ${chineseMatch[1]}` };
      }
      if (englishNameMatch) {
        return { code, name: englishNameMatch[1].trim() };
      }
      return { code };
    }

    // 检查是否是基金 - LLM规则: 輝立港元貨幣市場基金 的 stockCode 固定设置为 PHILLIP_HKD_MMF
    if (particulars.includes('PHILLIP') && particulars.includes('MMF')) {
      return { code: 'PHILLIP_HKD_MMF', name: '輝立港元貨幣市場基金' };
    }
    if (
      particulars.includes('輝立港元貨幣市場基金') ||
      particulars.includes('辉立港元货币市场基金')
    ) {
      return { code: 'PHILLIP_HKD_MMF', name: '輝立港元貨幣市場基金' };
    }

    // 模式B: 提取股票代码: (100) 或 (2698) 或 (09988) - 支持 3-6 位数字，排除 (GROUP) 等
    const codeMatch = particulars.match(/\((\d{3,6})\)/);
    if (!codeMatch) {
      return null;
    }

    // 统一补齐到 6 位 (港股标准格式)
    // 例如: 100 -> 000100, 9980 -> 009980
    const code = this.normalizeStockCode(codeMatch[1]);

    // 尝试提取名称 - 从 particulars 中截取
    let name: string | undefined;
    // 保存原始代码用于在字符串中查找
    const rawCode = codeMatch[1];

    // 模式1: 新股認購 + 公司名称（包含括号的复杂名称，如 "EASTROC BEVERAGE (GROUP) CO., LTD."）
    // 匹配从 "新股認購" 到股票代码 "(XXXX)" 之前的所有内容
    const codeIndex = particulars.indexOf(`(${rawCode})`);
    if (codeIndex > 0) {
      // 查找 "新股認購" 或 "新股认购" 的位置
      let startIndex = particulars.indexOf('新股認購');
      if (startIndex === -1) startIndex = particulars.indexOf('新股认购');

      if (startIndex !== -1) {
        // 提取从 "新股認購" 后到股票代码前的内容
        const rawName = particulars.substring(startIndex + 4, codeIndex).trim();

        // 清理名称：移除 "支付"、"收入" 等干扰词
        const cleanedName = rawName
          .replace(/\s*(支付|收入|Payment|Receipt)\s*/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (cleanedName.length > 0) {
          name = cleanedName;
        }
      }
    }

    // 模式2: 股票代码后面跟着的名称（回退方案）
    if (!name) {
      // 支持包含括号的公司名称，如 "(GROUP)"
      const nameMatch2 = particulars.match(
        /\(\d{3,6}\)\s*([A-Z][A-Z\s.,()]+(?:LIMITED|LTD\.?|CO\.?))/i
      );
      if (nameMatch2) {
        // 尝试找中文名
        const chineseMatch = particulars.match(/([\u4e00-\u9fff]{2,})/);
        if (chineseMatch) {
          name = `${nameMatch2[1].trim()} ${chineseMatch[1]}`;
        } else {
          name = nameMatch2[1].trim();
        }
      }
    }

    return { code, name };
  }

  /**
   * 解析 IPO ALLOT 的数量和价格
   * 特殊处理：从 "獲配股數 XX" 或 "ALLOTED SHARES XX" 提取数量
   * 格式示例:
   * - "IPO 新股認購 MINIMAX GROUP INC. (100) ALLOTED AMOUNT 獲配金額 20 支付 @165"
   * - "IPO 新股認購 MINIMAX GROUP INC. (100) ALLOTED SHARES 獲配股數 20 股票 存貨"
   */
  private parseIpoAllotQuantityPrice(
    particulars: string
  ): { quantity?: number; price?: number } | null {
    // 从 "獲配股數 XX" 或 "獲配金額 XX" 提取数量
    const allotQtyMatch = particulars.match(
      /(?:獲配股數|獲配金額|ALLOTED\s+(?:SHARES|AMOUNT))\s+(\d+)/i
    );
    let quantity: number | undefined;
    if (allotQtyMatch) {
      quantity = parseInt(allotQtyMatch[1], 10);
    }

    // 从 @price 提取价格
    const priceMatch = particulars.match(/@\s*(\d+(?:\.\d+)?)/);
    let price: number | undefined;
    if (priceMatch) {
      price = parseFloat(priceMatch[1]);
    }

    if (quantity !== undefined || price !== undefined) {
      return { quantity, price };
    }
    return null;
  }

  /**
   * 解析股票买卖的数量和价格
   * 格式: 股票名 数量 价格.xxxx 金额 股票 賣出/買入 /XHKG/代码
   * 如: "MINIMAX-WP 20 288.0000 5,760.00 股票 賣出 /XHKG/000100 ..."
   * 解析结果: quantity=20, price=288.0000
   */
  private parseStockTradeQuantityPrice(
    particulars: string
  ): { quantity?: number; price?: number } | null {
    // 匹配模式: 股票名 数量 价格 金额 股票 賣出/買入 /XHKG/代码
    // 股票名可能包含字母、数字、-、空格，但后面紧跟的是 数量 价格 金额
    // 格式: NAME 数量(整数) 价格(小数,4位) 金额(带逗号)
    const match = particulars.match(
      /^[A-Z][A-Z0-9\s-]+?\s+(\d+)\s+(\d+(?:\.\d+)?)\s+[\d,]+(?:\.\d+)?\s+股票\s+(?:賣出|買入|卖出|买入)/
    );
    if (match) {
      return {
        quantity: parseInt(match[1], 10),
        price: parseFloat(match[2]),
      };
    }
    return null;
  }

  /**
   * 解析数量和价格 - 从 description 结尾提取 数量@价格
   * 格式: ... 1,000 @9.8 或 ... 40,000 @40
   */
  private parseQuantityPriceFromEnd(
    particulars: string
  ): { quantity?: number; price?: number } | null {
    // 优先尝试解析股票买卖格式 (如 "MINIMAX-WP 20 288.0000 5,760.00 股票 賣出 /XHKG/000100")
    const stockTrade = this.parseStockTradeQuantityPrice(particulars);
    if (stockTrade) {
      return stockTrade;
    }

    // 从结尾匹配: 数量 @价格 (数量可以有逗号分隔符)
    const match = particulars.match(/([\d,]+)\s*@\s*([\d.]+)\s*$/);
    if (match) {
      return {
        quantity: parseFloat(match[1].replace(/,/g, '')),
        price: parseFloat(match[2]),
      };
    }

    // 备选：匹配 数量@价格 紧挨着（可能不在结尾）
    const match2 = particulars.match(/([\d,]+)\s*@\s*([\d.]+)/);
    if (match2) {
      return {
        quantity: parseFloat(match2[1].replace(/,/g, '')),
        price: parseFloat(match2[2]),
      };
    }

    // 回退到原来的方法（支持更复杂的格式，如 REDEEM 86.65 ... @11.4219）
    return this.parseQuantityPrice(particulars);
  }

  /**
   * 解析数量和价格
   */
  private parseQuantityPrice(particulars: string): { quantity?: number; price?: number } | null {
    // 格式0: 申請按金 1,000 ... @165 (IPO 申购专用)
    const match0 = particulars.match(/申請按金\s+([\d,]+).*?@\s*([\d.]+)/);
    if (match0) {
      return {
        quantity: parseFloat(match0[1].replace(/,/g, '')),
        price: parseFloat(match0[2]),
      };
    }

    // 格式1: 3,000 @26.2 或 641.5 PHILLIP HKD MMF @11.4114
    const match1 = particulars.match(/([\d,]+\.?\d*)\s*(?:.*?)@\s*([\d.]+)/);
    if (match1) {
      return {
        quantity: parseFloat(match1[1].replace(/,/g, '')),
        price: parseFloat(match1[2]),
      };
    }

    // 格式2: REDEEM 86.65 ... @11.4219
    const match2 = particulars.match(/REDEEM\s+([\d,]+\.?\d*)\s+.*?@\s*([\d.]+)/i);
    if (match2) {
      return {
        quantity: parseFloat(match2[1].replace(/,/g, '')),
        price: parseFloat(match2[2]),
      };
    }

    // 格式3: W/D 86.65 (提货，没有价格)
    const match3 = particulars.match(/W\/D\s+([\d,]+\.?\d*)/i);
    if (match3) {
      return {
        quantity: parseFloat(match3[1].replace(/,/g, '')),
        price: undefined,
      };
    }

    return null;
  }

  /**
   * 转换日期格式
   * DD/MM/YY → YYYY-MM-DD
   * LLM规则: Century 始终为 20XX
   */
  private convertDateFormat(dateStr?: string): string {
    if (!dateStr) return '';

    // 检查是否已经是 YYYY-MM-DD 格式
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }

    // DD/MM/YY 格式
    const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    if (match) {
      const [, day, month, year] = match;
      const fullYear = 2000 + parseInt(year, 10);
      return `${fullYear}-${month}-${day}`;
    }

    // DD/MM/YYYY 格式
    const match2 = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match2) {
      const [, day, month, year] = match2;
      return `${year}-${month}-${day}`;
    }

    return dateStr;
  }

  /**
   * 映射交易类型
   * 遵循 LLM Prompt 规则
   */
  private mapTransactionType(rawType?: string, category?: string): TradeData['transactionType'] {
    // 根据分类优先判断
    if (category === 'REDEEM') {
      return 'SELL'; // 赎回 → SELL
    }
    if (category === 'STOCK_SELL') {
      return 'SELL';
    }
    if (category === 'DIVIDEND') {
      return 'DIVIDEND';
    }
    if (category === 'INTEREST') {
      return 'FEE'; // 利息计入费用 (IPO利息等)
    }
    if (category === 'WITHDRAW') {
      return 'WITHDRAWAL';
    }
    if (category === 'DEPOSIT') {
      return 'DEPOSIT';
    }
    if (
      category === 'FUND_SUBSCRIBE' ||
      category === 'STOCK_BUY' ||
      category === 'REVERSE_REDEEM'
    ) {
      // REVERSE_REDEEM: 撤销赎回 = 钱回流基金 = BUY
      return 'BUY';
    }

    // 根据原始类型映射
    if (rawType && TRANSACTION_TYPE_MAP[rawType]) {
      return TRANSACTION_TYPE_MAP[rawType];
    }

    return 'OTHER';
  }

  /**
   * 获取 IPO 类型
   * LLM规则: apply (申购) | allot (中签)
   */
  private getIPOType(subType?: string): 'apply' | 'allot' {
    if (subType === 'IPO_ALLOT') {
      return 'allot';
    }
    // 所有其他 IPO 子类型都是 apply 阶段
    return 'apply';
  }

  /**
   * 映射资产分类
   */
  private mapAssetCategory(assetType?: string): SnapshotData['assetCategory'] {
    if (!assetType) return 'Other';

    const lower = assetType.toLowerCase();
    if (lower.includes('cash') || lower === 'hkd' || lower === 'usd') {
      return 'Cash';
    }
    if (lower.includes('fund') || lower.includes('mmf')) {
      return 'Fund';
    }
    if (lower.includes('stock')) {
      return 'Stock';
    }
    if (lower.includes('bond')) {
      return 'Bond';
    }

    return 'Other';
  }

  /**
   * 标准化港股代码为 6 位格式
   * 港交所官方代码为 5 位，但 PDF 数据源通常使用 6 位 (如 /XHKG/009611)
   * 统一补齐到 6 位以确保一致性
   * 例如: 100 -> 000100, 9980 -> 009980, 09988 -> 009988
   */
  private normalizeStockCode(code: string): string {
    // 只处理纯数字代码
    if (/^\d+$/.test(code) && code.length < 6) {
      return code.padStart(6, '0');
    }
    return code;
  }
}
